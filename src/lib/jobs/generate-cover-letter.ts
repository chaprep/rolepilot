import "server-only";

import { ENGLISH_LABELS } from "@/lib/document-labels";
import type { AIProvider } from "@/lib/ai/provider";
import { letterCandidateEvidence, planCoverLetterResearch, researchCoverLetter } from "@/lib/ai/tasks/research-cover-letter";
import { writeCoverLetter, type CoverLetterInput } from "@/lib/ai/tasks/write-cover-letter";
import type { TaskOptions } from "@/lib/ai/tasks/prompt-parts";
import { coverLetterFingerprint, coverLetterResearchSchema, researchVersion } from "@/lib/cover-letter-research";
import { loadOneSetup } from "@/lib/one/config";

import { RESEARCH_COVER_LETTER_STEP, WRITE_COVER_LETTER_STEP } from "./application-steps";
import type { JobContext } from "./runner";

export async function generateCoverLetter(provider: AIProvider, input: CoverLetterInput & { postingUrl?: string }, options: TaskOptions, { id, signal, step }: JobContext) {
  const posting = {
    company: input.extracted.company ?? "", role: input.extracted.role ?? "", location: input.extracted.location ?? "",
    postingUrl: input.postingUrl ?? "", postingText: input.posting,
  };
  let research: { outcome: "unavailable" } | Awaited<ReturnType<typeof researchCoverLetter>> = { outcome: "unavailable" };
  if (provider.toolTurn && posting.company.trim()) {
    const setup = await loadOneSetup().catch(() => null);
    signal.throwIfAborted();
    if (setup?.reference && setup.connectionKey) {
      await step(RESEARCH_COVER_LETTER_STEP);
      const evidence = letterCandidateEvidence(input);
      const plan = await planCoverLetterResearch(provider, input, evidence, AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
        .catch(() => ({ question: "Which current company priorities relate to this role?", topics: ["the role", "company strategy"] as const, candidateIds: [] }));
      signal.throwIfAborted();
      research = await researchCoverLetter(provider.toolTurn.bind(provider), posting, { ...plan, topics: [...plan.topics] }, evidence, { signal, jobId: id });
    }
  }
  signal.throwIfAborted();
  const brief = coverLetterResearchSchema.parse({
    findings: [], ...research, version: 1, promptVersion: researchVersion,
    researchedAt: new Date().toISOString(), fingerprint: coverLetterFingerprint(posting),
  });
  await step(WRITE_COVER_LETTER_STEP);
  const letter = await writeCoverLetter(provider, { ...input, research: brief }, { ...options, signal });
  signal.throwIfAborted();
  const data = letter.data.map(unit => unit.id === "greeting"
    ? { ...unit, text: ENGLISH_LABELS.greeting(posting.company.trim()) }
    : unit);
  return { ...letter, data, research: brief };
}
