// Scorer names retained for compatibility with saved settings.

export const SCORERS = ["AI", "JEV"] as const;
export type Scorer = (typeof SCORERS)[number];

/** Like the job sources' keys: saved here, from ROLEPILOT_TYPESAFE_KEY, missing, or saved under another ROLEPILOT_SECRET. */
export type ScoringKeyState = "none" | "set" | "unreadable" | "env";

/** Scoring readiness without the shared OpenRouter key. */
export type ScoringView = { scorer: Scorer; keyState: ScoringKeyState };

export const TYPESAFE_KEY_URL = "https://console.typesafe.ai/keys";

export const SCORING_KEY_MISSING = "Enter your OpenRouter key in Settings → AI provider first.";
export const SCORING_KEY_UNREADABLE = "Your saved OpenRouter key cannot be read. Enter it again in Settings → AI provider.";
