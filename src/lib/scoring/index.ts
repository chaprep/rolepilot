import "server-only";

import { AiError } from "@/lib/ai/errors";
import type { PostingFit } from "@/lib/fit";
import { type FoundPosting } from "@/lib/job-search/search";
import type { ProfileData } from "@/lib/profile";
import { recordUsage } from "@/lib/usage-data";

import { jevKey, loadScoringConfig, type ScoringConfig } from "./config";
import { scoreWithJev } from "./jev";

// Scoring a posting against the profile (#208, #274), with whatever Settings →
// Scoring chose: the AI model's score-posting, or Jev. Find jobs' Score and
// the job agent both come here.

export type ScorablePosting = Pick<FoundPosting, "title" | "company" | "place" | "remote" | "salary" | "description">;

/** Scores one posting; `scoredWith` is kept with the score (PostingScore). */
export type PostingScorer = (posting: ScorablePosting, profile: ProfileData, signal: AbortSignal) => Promise<{ data: PostingFit; scoredWith: string }>;

export const AI_PROVIDER_MISSING = "Choose an AI provider in Settings → AI provider first.";

/** Why postings can't be scored, in words, or null when the chosen scorer is set up. */
export async function scoringProblem(config?: ScoringConfig): Promise<string | null> {
  const settled = config ?? (await loadScoringConfig());
  return jevKey(settled).problem;
}

/**
 * The scorer Settings → Scoring chose, set up once for any number of
 * postings. Fails as an AiError when it isn't set up.
 */
export async function loadPostingScorer(): Promise<PostingScorer> {
  const config = await loadScoringConfig();
  const jev = jevKey(config);
  if (jev.problem !== null) throw AiError.config(jev.problem);
  return (posting, profile, signal) => scoreWithJev(posting, profile, { key: jev.key, signal, onUsage: recordUsage });
}
