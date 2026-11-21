import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";
import { decryptSecret, ZYTE_KEY } from "@/lib/secrets";
import { loadSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { saveZyteKey, setCompanyResearch, testZyteConnection } from "./research-actions";

vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "z".repeat(40), ROLEPILOT_DATA_DIR: "/tmp/rolepilot-research-fixture" } }));
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

beforeEach(() => resetDatabase(db.client!));
afterEach(() => vi.unstubAllGlobals());
afterAll(() => db.client!.$disconnect());

it("stores an encrypted key, tests both endpoints, and resets enablement on replacement and removal", async () => {
  const initial = await saveZyteKey({ action: "set", value: "zyte-action-test-secret" });
  expect(initial).toEqual({ ok: true, data: { keyState: "set", enabled: false, verified: false } });
  expect(JSON.stringify(initial)).not.toContain("zyte-action-test-secret");
  const saved = await loadSettings();
  expect(saved.zyteKeyEnc).toMatch(/^v2\./);
  expect(decryptSecret(ZYTE_KEY, saved.zyteKeyEnc!)).toBe("zyte-action-test-secret");

  const requests = stubFetch(({ url }) => url.pathname.endsWith("search")
    ? json({ status: "success", organicResults: [] })
    : json({ url: "https://example.com/", browserHtml: "<main>Example Domain</main>" }));
  expect(await testZyteConnection({})).toMatchObject({ ok: true, data: { verified: true, enabled: false } });
  expect(requests.map(({ url }) => url.pathname)).toEqual(["/v1/search", "/v1/extract"]);
  expect(await setCompanyResearch({ enabled: true })).toMatchObject({ ok: true, data: { verified: true, enabled: true } });
  expect(requests).toHaveLength(2);
  expect(await setCompanyResearch({ enabled: false })).toMatchObject({ ok: true, data: { enabled: false, verified: true } });

  await setCompanyResearch({ enabled: true });
  expect(await saveZyteKey({ action: "set", value: "new-key" })).toMatchObject({ ok: true, data: { verified: false, enabled: false } });
  expect(await saveZyteKey({ action: "clear" })).toMatchObject({ ok: true, data: { keyState: "none" } });
  expect(await loadSettings()).toMatchObject({ zyteKeyEnc: null, companyResearchEnabled: false, zyteVerified: false });
});

it("requires a successful Google-domain search and public page retrieval before enabling", async () => {
  await saveZyteKey({ action: "set", value: "bad-credential" });
  const requests = stubFetch(() => json({}, { status: 401 }));
  expect(await testZyteConnection({})).toMatchObject({ ok: false, error: expect.stringContaining("rejected the API key") });
  expect(requests).toHaveLength(1);
  stubFetch(() => json({}, { status: 422 }));
  expect(await setCompanyResearch({ enabled: true })).toMatchObject({ ok: false, error: expect.stringContaining("google.com") });
  stubFetch(({ url }) => url.pathname.endsWith("search")
    ? json({ status: "success", organicResults: [] })
    : json({ url: "https://example.com/", browserHtml: "<main>Missing</main>", statusCode: 404 }));
  expect(await setCompanyResearch({ enabled: true })).toMatchObject({ ok: false, error: expect.stringContaining("page retrieval failed") });
  expect(await loadSettings()).toMatchObject({ companyResearchEnabled: false, zyteVerified: false });
});
