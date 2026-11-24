"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { updateDocuments } from "@/lib/document-units";
import { saveVersion } from "@/lib/document-versions";
import { findHiringContactsJob, peopleJobKey, peopleJobLock, postingFingerprint } from "@/lib/jobs/find-hiring-contacts";
import { startJob } from "@/lib/jobs/runner";
import { FRAME_LABELS, withFrame } from "@/lib/letter-frame";
import { peopleResearchSchema } from "@/lib/people/schema";
import { prisma } from "@/lib/prisma";

const applicationId = z.string().min(1);
const target = z.enum(["COVER_LETTER", "EMAIL"]);
const refresh = (id: string) => revalidatePath(`/applications/${id}`);

export const startPeopleSearch = action(z.object({ id: applicationId }), async ({ id }) => {
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError("This application is gone.");
  return startJob(findHiringContactsJob, { applicationId: id }, { applicationId: id, key: peopleJobKey(id), dedupeLock: peopleJobLock });
});

export const applyHiringContact = action(z.object({
  id: applicationId, target, contactId: z.string().min(1).max(128), searchedAt: z.iso.datetime(),
  expected: z.string().max(100_000).nullable(),
}), async ({ id, target, contactId, searchedAt, expected }) => {
  const result = await updateDocuments(id, async (documents, tx) => {
    const application = await tx.application.findUniqueOrThrow({ where: { id } });
    const search = peopleResearchSchema.safeParse(application.peopleResearch);
    const contact = search.success && search.data.searchedAt === searchedAt
      && search.data.fingerprint === postingFingerprint(application) && search.data.contacts.find((person) => person.id === contactId);
    if (!contact) throw new ActionError("This contact is out of date. Search again for the current posting.");

    const units = documents[target];
    if (!units) throw new ActionError("Write the draft first.");
    const unitId = target === "EMAIL" ? "body" : "greeting";
    const unit = units.find((part) => part.id === unitId);
    const previous = unit?.text ?? null;
    if (previous !== expected) throw new ActionError("The draft changed. Review the new version and try again.");

    const [firstName] = contact.name.split(/\s+/u, 1);
    const greeting = target === "EMAIL" ? `Hi ${firstName},` : `Dear ${firstName},`;
    const original = previous ?? "";
    const leadingGreeting = /^(?:(?:hi|hello|dear|hey|good (?:day|morning|afternoon|evening))\b[^\r\n]{0,170}[,:!][^\S\r\n]*(?=\r?\n|$))[^\S\r\n]*/iu;
    const updated = target === "EMAIL"
      ? (leadingGreeting.test(original) ? original.replace(leadingGreeting, () => greeting) : `${greeting}\n\n${original}`)
      : greeting;
    if (updated !== previous) {
      const document = await tx.document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: id, kind: target } }, select: { id: true } });
      await saveVersion(tx, document.id, units, { cause: "BEFORE_RESTORE", detail: "Before applying hiring contact" });
      if (unit) unit.text = updated;
      else if (target === "COVER_LETTER") documents[target] = withFrame(units, { greeting: updated });
      else throw new ActionError("The email has no message to greet.");
    }
    return { previous, updated };
  });
  refresh(id);
  return result;
});

export const undoHiringContact = action(z.object({
  id: applicationId, target, previous: z.string().max(100_000).nullable(), updated: z.string().max(100_500),
}), async ({ id, target, previous, updated }) => {
  await updateDocuments(id, async (documents) => {
    const unitId = target === "EMAIL" ? "body" : "greeting";
    const units = documents[target];
    const unit = units?.find((part) => part.id === unitId);
    if (!units || !unit || unit.text !== updated) throw new ActionError("The draft changed and this greeting can’t be undone.");
    if (previous === null && target === "COVER_LETTER") {
      documents[target] = units.filter((part) => part.id !== unitId);
    } else if (previous !== null) unit.text = previous;
    else throw new ActionError("There is no previous greeting to restore.");
  }, { version: { cause: "UNDONE", detail: FRAME_LABELS.greeting } });
  refresh(id);
  return null;
});
