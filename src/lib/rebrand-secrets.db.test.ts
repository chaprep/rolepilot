import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { legacyCiphertext } from "@/test/legacy-secret";
import { AI_API_KEY, decryptSecret } from "@/lib/secrets";
import { migrateLegacySecrets } from "./rebrand-secrets";
vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "a".repeat(32) } }));
const db = createTestClient();
beforeEach(() => resetDatabase(db));
afterAll(() => db.$disconnect());
it("rewraps credentials once and preserves unreadable legacy values", async () => {
  await db.setting.createMany({ data: [
    { key: "apiKeyEnc", value: legacyCiphertext(AI_API_KEY, "saved-key") },
    { key: "jsearchKeyEnc", value: "v1.damaged.value" },
    { key: "other", value: "unchanged" },
  ] });
  expect(await migrateLegacySecrets(db)).toEqual({ migrated: 1, unreadable: 1 });
  const saved = (await db.setting.findUniqueOrThrow({ where: { key: "apiKeyEnc" } })).value;
  expect(saved).toMatch(/^v2\./);
  expect(decryptSecret(AI_API_KEY, saved)).toBe("saved-key");
  expect((await db.setting.findUniqueOrThrow({ where: { key: "jsearchKeyEnc" } })).value).toBe("v1.damaged.value");
  expect(await migrateLegacySecrets(db)).toEqual({ migrated: 0, unreadable: 1 });
});
