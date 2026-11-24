import "server-only";

import { prepareCandidateProfile, assertCandidateContext, candidateMemoryRevision } from "@/lib/memory/context";

import { z } from "zod";

import { Tone } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { tailorResume } from "@/lib/ai/tasks";
import { extractedSchema, matchSchema, unitsSchema } from "@/lib/application-data";
import { loadProfile } from "@/lib/profile-data";
import { withoutSectionsOff } from "@/lib/resume-sections";
import { DOCUMENTS_TO_WRITE } from "@/lib/settings";
import { loadSettings } from "@/lib/settings-data";

import { coverLetterResearchSchema } from "@/lib/cover-letter-research";

import { TAILOR_RESUME_STEP } from "./application-steps";

import { generateCoverLetter } from "./generate-cover-letter";
import { defineJob } from "./runner";

/**
 * Writes the tailored resume and cover letter (E7-6, NEW-7), or only the one
 * asked for (#367): one that isn't written comes back empty, with no
 * `…With`, and the application is created without it. Saves nothing: the
 * application is created from the result in one transaction afterwards, so
 * leaving midway leaves nothing behind.
 */
export const writeDocumentsJob = defineJob({
  type: "write-documents",
  input: z.object({
    /** The job that read the posting; its result and input are the source of truth. */
    readJobId: z.string().min(1),
    posting: z.string().min(1),
    postingUrl: z.string().max(2000).optional(),
    /** What was read, with the user's corrections (company, role…) for the prompts. */
    extracted: extractedSchema,
    /** The match as shown, including skills added to the profile since. */
    match: matchSchema,
    tone: z.enum(Tone),
    note: z.string().max(2000),
    evidenceFacts: z.array(z.string().max(1000)).max(49).optional(),
    /** Which documents to write (#367); the job agent and the connector write both. */
    write: z.enum(DOCUMENTS_TO_WRITE).default("both"),
  }),
  result: z.object({ memoryRevision: z.number().int().optional(), resume: unitsSchema, resumeWith: z.string(), letter: unitsSchema, letterWith: z.string(), coverLetterResearch: coverLetterResearchSchema.optional() }),
  async run({ posting, postingUrl, extracted, match, tone, note, write, evidenceFacts = [] }, context) {
    const { step, signal } = context;
    if (write !== "letter") await step(TAILOR_RESUME_STEP);
    const [provider, options, fullProfile, settings] = await Promise.all([getAiProvider(), loadTaskOptions(), loadProfile(), loadSettings()]);
    // A section that's off on the base resume isn't written about (#297).
    const evidenceProfile = await prepareCandidateProfile(fullProfile, posting, signal, provider);
    const profile = withoutSectionsOff(evidenceProfile, settings.resumeSections);
    // "Anything I should know?" is the application's first fact (APP-15).
    const facts = [...(note.trim() ? [note.trim()] : []), ...evidenceFacts];
    const skipped = { data: [], promptVersion: "" };
    // Tailored skills use the job-specific grouping; profile ordering stays unchanged.
    const resume =
      write === "letter"
        ? skipped
        : await tailorResume(provider, { profile, evidenceProfile, extracted, match, facts, posting }, { ...options, signal });

    const letter = write === "resume" ? null : await generateCoverLetter(provider, { profile, extracted, match, tone, facts, posting, postingUrl }, options, context);

    await assertCandidateContext(evidenceProfile);
    return { memoryRevision: candidateMemoryRevision(evidenceProfile), resume: resume.data, resumeWith: resume.promptVersion, letter: letter?.data ?? [], letterWith: letter?.promptVersion ?? "", coverLetterResearch: postingUrl === undefined ? undefined : letter?.research };
  },
});

export type WriteDocumentsInput = z.infer<typeof writeDocumentsJob.input>;
export type WriteDocumentsResult = z.infer<typeof writeDocumentsJob.result>;
