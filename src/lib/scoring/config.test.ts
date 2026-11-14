import { expect, it, vi } from "vitest";
import { resolveScoringConfig, jevKey } from "./config";
import { encryptApiKey } from "@/lib/ai/api-key";
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "a".repeat(32) } }));
vi.mock("@/lib/settings-data", () => ({ loadSettings: async () => ({}) }));
it("always uses Jev with the shared encrypted OpenRouter key", () => {
 const config = resolveScoringConfig({ scorer: "AI", typesafeKeyEnc: "obsolete", provider: "OPENAI", baseUrl: "https://openrouter.ai/api/v1", apiKeyEnc: encryptApiKey("shared-key") }, {});
 expect(config).toMatchObject({ scorer: "JEV", key: "shared-key", keyState: "set" });
 expect(jevKey(config)).toEqual({ key: "shared-key", problem: null });
});
it("does not use a TypeSafe key or scorer override from legacy settings", () => {
 const config = resolveScoringConfig({ scorer: "AI", typesafeKeyEnc: "old" }, { DOSSIER_TYPESAFE_KEY: "old", DOSSIER_SCORER: "ai" });
 expect(config.key).toBeNull(); expect(config.scorer).toBe("JEV");
 expect(jevKey(config).problem).toContain("OpenRouter");
});
