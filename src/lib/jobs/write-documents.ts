import { prepareCandidateProfile, assertCandidateContext, candidateMemoryRevision } from "@/lib/memory/context";
import "server-only";

import { z } from "zod";

import { Tone } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { tailorResume, writeCoverLetter } from "@/lib/ai/tasks";
import { extractedSchema, matchSchema, unitsSchema } from "@/lib/application-data";
import { companyResearchSchema } from "@/lib/research/schema";
import { researchForWriting, researchInput } from "@/lib/research/application";
import { loadProfile } from "@/lib/profile-data";
import { withoutSectionsOff } from "@/lib/resume-sections";
import { DOCUMENTS_TO_WRITE } from "@/lib/settings";
import { loadSettings } from "@/lib/settings-data";

import { WRITE_DOCUMENTS_STEPS } from "./application-steps";
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
    companyWebsite: z.string().max(2048).optional(),
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
  result: z.object({ memoryRevision: z.number().int().optional(), resume: unitsSchema, resumeWith: z.string(), letter: unitsSchema, letterWith: z.string(), companyResearch: companyResearchSchema.optional() }),
  async run({ posting, postingUrl, companyWebsite, extracted, match, tone, note, write, evidenceFacts = [] }, context) {
    const { step, signal } = context;
    if (write !== "letter") await step(WRITE_DOCUMENTS_STEPS[0]);
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

    const companyResearch = write === "resume" || !settings.companyResearchEnabled ? undefined
      : await researchForWriting(researchInput({ extracted, posting, postingUrl, website: companyWebsite }), settings, provider, context);
    if (write !== "resume") await step(WRITE_DOCUMENTS_STEPS[1]);
    const letter = write === "resume" ? skipped : await writeCoverLetter(provider, { profile, extracted, match, tone, facts, posting, companyResearch }, { ...options, signal });

    await assertCandidateContext(evidenceProfile);
    return { ...(companyResearch ? { companyResearch } : {}), memoryRevision: candidateMemoryRevision(evidenceProfile), resume: resume.data, resumeWith: resume.promptVersion, letter: letter.data, letterWith: letter.promptVersion };
  },
});

export type WriteDocumentsInput = z.infer<typeof writeDocumentsJob.input>;
export type WriteDocumentsResult = z.infer<typeof writeDocumentsJob.result>;
