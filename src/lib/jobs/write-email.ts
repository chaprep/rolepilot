import { prepareCandidateProfile, assertCandidateContext } from "@/lib/memory/context";
import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { writeEmail } from "@/lib/ai/tasks";
import { extractedOf, matchSchema, unitsSchema, type Unit } from "@/lib/application-data";
import { loadDocuments, snapshotDocumentState } from "@/lib/application-documents";
import { emailParts } from "@/lib/application-email";
import { updateDocuments } from "@/lib/document-units";
import { saveVersion } from "@/lib/document-versions";
import { tailoredProfile } from "@/lib/resume-fit";
import { documentStateSchema, readDocumentState } from "@/lib/document-state";
import { isParagraph } from "@/lib/letter-frame";
import { prisma } from "@/lib/prisma";
import { loadFactTexts, loadProfile } from "@/lib/profile-data";
import { startupAddress } from "@/lib/startups/types";

import { defineJob } from "./runner";

/** The key of an application's email writing, to find it again after a reload. */
export const emailJobKey = (applicationId: string) => `email:${applicationId}`;

/**
 * Writes the application's email (its Email tab), or writes it again: the
 * recipient the posting names, a subject and the message, saved as the
 * EMAIL document with a version of its own. Writing again keeps a recipient
 * the posting doesn't give, which the user typed in. An application started
 * from Startups gets the address the startup publishes (#222), filled in
 * here: addresses never go to the AI.
 */
export const writeEmailJob = defineJob({
  type: "write-email",
  input: z.object({ applicationId: z.string().min(1) }),
  result: z.object({
    /** The email as written. */
    units: unitsSchema,
    /** The email it replaced, for Undo; null for the first one. */
    previous: unitsSchema.nullable(),
    previousState: documentStateSchema.nullable().optional(),
    state: documentStateSchema.optional(),
  }),
  async run({ applicationId }, { step, signal }) {
    await step("Writing the email");
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { documents: true, startup: { select: { emails: true } } } });
    const unitsOf = (kind: DocumentKind): Unit[] | null => {
      const parsed = unitsSchema.safeParse(application.documents.find((document) => document.kind === kind)?.units);
      return parsed.success ? parsed.data : null;
    };
    const match = matchSchema.safeParse(application.match);

    const [provider, options, profile] = await Promise.all([getAiProvider(), loadTaskOptions(), loadProfile()]);
    const resumeState = readDocumentState(application.documents.find(document => document.kind === "RESUME")?.state);
    const emailState = readDocumentState(application.documents.find(document => document.kind === "EMAIL")?.state);
    const localProfile = resumeState ? tailoredProfile(resumeState.profile, unitsOf(DocumentKind.RESUME) ?? []) : profile;
    const candidate = await prepareCandidateProfile(emailState ? { ...localProfile, basics: { ...localProfile.basics, ...emailState.profile.basics, summary: localProfile.basics.summary } } : localProfile, application.postingText, signal, provider);
    const { data, promptVersion } = await writeEmail(
      provider,
      {
        profile: candidate,
        extracted: extractedOf(application),
        match: match.success ? match.data : null,
        tone: application.tone,
        facts: await loadFactTexts(applicationId),
        posting: application.postingText,
        // Only the paragraphs: the letter's sender and signature hold contact details (E8-11).
        letter: (unitsOf(DocumentKind.COVER_LETTER) ?? []).filter(isParagraph).map((unit) => unit.text),
      },
      // English regardless of the older application language.
      { ...options, signal },
    );

    const state = { ...snapshotDocumentState(await loadDocuments(applicationId), DocumentKind.EMAIL), language: "English" };
    const startupTo = startupAddress(application.startup?.emails);
    const withTo = (units: Unit[], kept = "") =>
      units.map((unit) => (unit.id === "to" && !unit.text && (kept || startupTo) ? { ...unit, text: kept || startupTo } : unit));

    if (!unitsOf(DocumentKind.EMAIL)) {
      try {
        await prisma.$transaction(async (tx) => {
          await assertCandidateContext(candidate, tx);
          const document = await tx.document.create({ data: { applicationId, kind: DocumentKind.EMAIL, units: withTo(data), state: state as unknown as Prisma.InputJsonValue, writtenWith: promptVersion } });
          await saveVersion(tx, document.id, withTo(data), { cause: VersionCause.WRITTEN });
        });
        return { units: withTo(data), previous: null, previousState: null, state };
      } catch (error) {
        // Written meanwhile: write over it, as below.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }

    const written = await updateDocuments(
      applicationId,
      async (documents, tx, states) => {
        await assertCandidateContext(candidate, tx);
        const previous = documents[DocumentKind.EMAIL] ?? [];
        const units = withTo(data, emailParts(previous).to);
        const previousState = structuredClone(states.EMAIL ?? null);
        states.EMAIL = state;
        documents[DocumentKind.EMAIL] = units;
        return { units, previous, previousState, state };
      },
      { version: { cause: VersionCause.WRITTEN } },
    );
    await prisma.document.updateMany({ where: { applicationId, kind: DocumentKind.EMAIL }, data: { writtenWith: promptVersion } });
    return written;
  },
});

export type WriteEmailResult = z.infer<typeof writeEmailJob.result>;
