import "server-only";

import { env, type Env } from "@/lib/env";
import { resolveAiConfig, keyStateOf } from "@/lib/ai/config";
import type { SettingsData } from "@/lib/settings";
import { loadSettings } from "@/lib/settings-data";

import { SCORING_KEY_MISSING, SCORING_KEY_UNREADABLE, type Scorer, type ScoringKeyState, type ScoringView } from "./scorers";

// What scores postings (#274): the choice saved in Settings → Scoring, or
// else ROLEPILOT_SCORER, or else the AI model; and Jev's key, saved there or
// in ROLEPILOT_TYPESAFE_KEY.

export type ScoringConfig = {
  scorer: Scorer;
  /** Whether the choice is saved in Settings, rather than coming from ROLEPILOT_SCORER or the default. */
  saved: boolean;
  key: string | null;
  keyState: ScoringKeyState;
};

export function resolveScoringConfig(
  saved: Pick<SettingsData, "scorer" | "typesafeKeyEnc"> & Partial<SettingsData>,
  source: Partial<Env>, secret?: string,
): ScoringConfig {
  const config = resolveAiConfig({ provider: saved.provider ?? null, baseUrl: saved.baseUrl ?? null,
    model: saved.model ?? null, apiKeyEnc: saved.apiKeyEnc ?? null }, source as Env, secret);
  return { scorer: "JEV", saved: true, key: config.apiKey,
    keyState: keyStateOf(saved as SettingsData, config) };
}

/** The scoring configuration in effect right now. */
export async function loadScoringConfig(): Promise<ScoringConfig> {
  return resolveScoringConfig(await loadSettings(), env);
}

export const scoringView = (config: ScoringConfig): ScoringView => ({ scorer: config.scorer, keyState: config.keyState });

/** Jev's key, or why there isn't one, in words. */
export function jevKey({ key, keyState }: Pick<ScoringConfig, "key" | "keyState">): { key: string; problem: null } | { key: null; problem: string } {
  if (key) return { key, problem: null };
  return { key: null, problem: keyState === "unreadable" ? SCORING_KEY_UNREADABLE : SCORING_KEY_MISSING };
}
