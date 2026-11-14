import { beforeEach, expect, it, vi } from "vitest";

import { demoProfile } from "@/lib/demo-profile";

import type { ScoringConfig } from "./config";
import { loadPostingScorer, scoringProblem } from "./index";

const state = vi.hoisted(() => ({
  config: { scorer: "AI", saved: false, key: null, keyState: "none" } as ScoringConfig,
  aiReady: true,
  provider: null as unknown,
}));

vi.mock("./config", async (importOriginal) => ({ ...(await importOriginal<typeof import("./config")>()), loadScoringConfig: async () => state.config }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: async () => state.aiReady }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => state.provider }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "BALANCED", strict: true, language: null }) }));
vi.mock("@/lib/usage-data", () => ({ recordUsage: vi.fn() }));
vi.mock("./jev", () => ({ scoreWithJev: vi.fn(async () => ({ data: { score: 80, reasons: ["Covers: Figma"], redFlags: [] }, scoredWith: "score-posting-jev@1 (jev-1.14.0)" })) }));

const { scoreWithJev } = await import("./jev");
const { recordUsage } = await import("@/lib/usage-data");

const profile = demoProfile();
const posting = { title: "Designer", company: "Ledgerly", place: "Amsterdam", remote: false, salary: "", description: "You know Figma." };
const signal = new AbortController().signal;

beforeEach(() => {
  state.config = { scorer: "AI", saved: false, key: null, keyState: "none" };
  state.aiReady = true;
  vi.mocked(scoreWithJev).mockClear();
});

it("uses Jev regardless of the legacy scorer selection", async () => {
 state.config = { scorer: "AI", saved: false, key: "shared", keyState: "set" };
 const score = await loadPostingScorer();
 expect((await score(posting, profile, signal)).data.score).toBe(80);
 expect(scoreWithJev).toHaveBeenCalledWith(posting, profile, {key:"shared",signal,onUsage:recordUsage});
});
it("requires the shared key for scoring and reports unreadable keys", async () => {
 expect(await scoringProblem()).toContain("OpenRouter");
 await expect(loadPostingScorer()).rejects.toThrow("OpenRouter");
 state.config.keyState="unreadable";
 await expect(loadPostingScorer()).rejects.toThrow("cannot be read");
});
