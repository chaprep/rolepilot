import { prepareCandidateProfile, assertCandidateContext } from "@/lib/memory/context";
import "server-only";

import { researchForEdits } from "@/lib/research/application";

import { z } from "zod";

import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { regenerateUnit } from "@/lib/ai/tasks";
import { extractedOf, unitSchema, unitsSchema } from "@/lib/application-data";
import { updateDocuments } from "@/lib/document-units";
import { withoutPrivateParts } from "@/lib/letter-frame";
import { prisma } from "@/lib/prisma";
import { readDocumentState } from "@/lib/document-state";
import { profileOfApplication } from "@/lib/frozen-copy";
import { loadFactTexts } from "@/lib/profile-data";

import { defineJob } from "./runner";

/** The key of an application's unit rewrites, to find them again after a reload. */
export const unitJobKey = (applicationId: string) => `units:${applicationId}`;

/**
 * Writes one unit again (E8-4, APP-5), with the rest of the document as
 * context. The new text replaces the unit only if it still reads as it did
 * when the rewrite started, so an edit made meanwhile wins.
 */
export const regenerateUnitJob = defineJob({
  type: "regenerate-unit",
  input: z.object({
    applicationId: z.string().min(1),
    document: z.enum(DocumentKind),
    unitId: z.string().min(1),
    /** The unit's text when the rewrite was asked for. */
    from: z.string(),
  }),
  result: z.discriminatedUnion("outcome", [
    /** `previous` is kept for Undo. */
    z.object({ outcome: z.literal("rewritten"), previous: unitSchema, unit: unitSchema }),
    /** The unit changed while it was being rewritten, and was left as it is. */
    z.object({ outcome: z.literal("changed") }),
  ]),
  async run({ applicationId, document, unitId, from }, { step, signal }) {
    await step("Rewriting");
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { startup: { select: { website: true } }, documents: { where: { kind: document } } },
    });
    const units = application?.documents[0] && unitsSchema.parse(application.documents[0].units);
    const unit = units?.find((entry) => entry.id === unitId);
    if (!application || !units || !unit || unit.text !== from) return { outcome: "changed" as const };

    const [provider, options, profile] = await Promise.all([getAiProvider(), loadTaskOptions(), profileOfApplication(application.frozen)]);
    const state = readDocumentState(application.documents[0].state);
    const candidate = await prepareCandidateProfile(state?.profile ?? profile, application.postingText, signal, provider);
    const { data } = await regenerateUnit(
      provider,
      {
        kind: document,
        unit,
        // The letter's sender and signature hold contact details, which never go to the model (E8-11).
        document: withoutPrivateParts(units),
        profile: candidate,
        extracted: extractedOf(application),
        tone: state?.tone ?? application.tone,
        facts: await loadFactTexts(applicationId),
        posting: application.postingText,
        companyResearch: document === "COVER_LETTER" ? researchForEdits(application) : undefined,
      },
      // Only the requested part is rewritten in English; retain historical layout metadata.
      { ...options, signal },
    );

    return updateDocuments(applicationId, async (documents, tx) => {
      await assertCandidateContext(candidate, tx);
      const current = documents[document]?.find((entry) => entry.id === unitId);
      if (!current || current.text !== from) return { outcome: "changed" as const };
      const previous = { ...current };
      current.text = data.text;
      if (data.unverified?.length) current.unverified = data.unverified;
      else delete current.unverified;
      return { outcome: "rewritten" as const, previous, unit: { ...current } };
    }, { version: { cause: VersionCause.REGENERATED, detail: unit.label } });
  },
});

export type RegenerateUnitResult = z.infer<typeof regenerateUnitJob.result>;
