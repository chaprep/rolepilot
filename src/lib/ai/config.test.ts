import { expect, it, vi } from "vitest";
import { encryptApiKey } from "./api-key";
import { resolveAiConfig, isAiUsable, keyStateOf } from "./config";
import { LUNA, OPENROUTER_URL } from "./assignments";
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "a".repeat(32) } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const state = vi.hoisted(() => ({ settings: { provider: "OPENAI", baseUrl: "https://openrouter.ai/api/v1", model: null, apiKeyEnc: null } as Record<string, unknown> }));
vi.mock("@/lib/settings-data", () => ({ loadSettings: async () => state.settings }));
const source = {} as Parameters<typeof resolveAiConfig>[1];
it("fixes the endpoint and model even with legacy overrides", () => {
  expect(resolveAiConfig(null, { ...source, DOSSIER_AI_PROVIDER: "anthropic", DOSSIER_AI_URL: "https://other.example", DOSSIER_AI_MODEL: "other" })).toMatchObject({ provider: "OPENAI", baseUrl: OPENROUTER_URL, model: LUNA, apiKey: null });
});
it("reuses an encrypted OpenRouter key, with no plaintext in the settings view", () => {
  const saved = { provider: "OPENAI" as const, baseUrl: OPENROUTER_URL, model: "old-model", apiKeyEnc: encryptApiKey("router-key") };
  const config = resolveAiConfig(saved, source);
  expect(config.apiKey).toBe("router-key");
  expect(keyStateOf(saved, config)).toBe("set");
});
it("never reuses another provider key, including a deceptive hostname", () => {
  for (const baseUrl of ["https://api.openai.com/v1", "https://openrouter.ai.example/v1"]) {
    const saved = { provider: "OPENAI" as const, baseUrl, model: null, apiKeyEnc: encryptApiKey("other-key") };
    expect(resolveAiConfig(saved, source).apiKey).toBeNull();
  }
});
it("uses the environment fallback and reports unreadable saved credentials", () => {
  expect(resolveAiConfig(null, { ...source, DOSSIER_AI_KEY: "env-key" }).apiKey).toBe("env-key");
  const saved = { provider: "OPENAI" as const, baseUrl: OPENROUTER_URL, model: null, apiKeyEnc: "broken" };
  const config = resolveAiConfig(saved, source);
  expect(config.apiKeyProblem).toBeTruthy();
  expect(keyStateOf(saved, config)).toBe("unreadable");
});
it("requires a key, not a model selection, for readiness", async () => {
  state.settings.apiKeyEnc = null;
  expect(await isAiUsable()).toBe(false);
  state.settings.apiKeyEnc = encryptApiKey("router-key");
  expect(await isAiUsable()).toBe(true);
});
