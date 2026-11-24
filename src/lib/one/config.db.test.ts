import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { GET } from "@/app/api/one/[action]/route";
import { getSession } from "@/lib/auth/session";
import { loadSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { loadOneSetup, saveOneConfig } from "./config";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return db.client; } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "test-secret-for-one-config-and-not-a-live-secret" } }));
vi.mock("@/lib/settings-views", () => ({ requestOrigin: async () => "http://localhost:3000" }));

const origin = "http://localhost:3000";
const credentials = {
  clientId: "test-client",
  clientSecret: "test-client-secret",
  connectKey: "test-connect-key",
  permissionSet: "test-permission",
  redirectUri: `${origin}/api/one/callback`,
};
const oneUser = `cu_${"a".repeat(64)}`;

const route = (action: string, query = "", headers: HeadersInit = {}) => GET(
  new NextRequest(`${origin}/api/one/${action}${query}`, { headers }),
  { params: Promise.resolve({ action }) },
);

db.client = createTestClient();
beforeEach(async () => {
  await resetDatabase(db.client!);
  vi.mocked(getSession).mockResolvedValue({ persistent: false, issuedAt: new Date(), expiresAt: new Date() });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => db.client?.$disconnect());

async function startFlow() {
  const authorize = await route("authorize");
  const location = new URL(authorize.headers.get("location")!);
  expect(location.hostname).toBe("api.withone.ai");
  expect(location.searchParams.get("permission_set")).toBe(credentials.permissionSet);
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  const cookie = authorize.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  const query = `?code=test-code&state=${location.searchParams.get("state")}`;
  return { query, cookie };
}

it("stores credentials encrypted and saves a grant only after a valid consent callback", async () => {
  const view = await saveOneConfig(credentials);
  expect(view).toMatchObject({ saved: true, connected: false });
  expect(JSON.stringify(view)).not.toContain(credentials.connectKey);
  expect(JSON.stringify(view)).not.toContain(credentials.clientSecret);
  expect((await loadSettings()).oneConfigEnc).toMatch(/^v2\./);

  const { query, cookie } = await startFlow();
  const exchange = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://api.withone.ai/oauth/token");
    expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
    expect(new URLSearchParams(String(init?.body)).get("code")).toBe("test-code");
    return Response.json({ connect_user_id: oneUser, access_token: "test-token" });
  });
  vi.stubGlobal("fetch", exchange);

  const denied = await route("callback", query);
  expect(denied.headers.get("location")).toContain("one_connect=error");
  expect(exchange).not.toHaveBeenCalled();

  const allowed = await route("callback", query, { cookie });
  expect(allowed.headers.get("location")).toContain("one_connect=success");
  const setup = (await loadOneSetup())!;
  expect(await setup.connect.getConnectUserId(setup.userId)).toBe(oneUser);
  expect((await loadSettings()).oneExaConnectionKey).toBeNull();
});

it("requires a session and refuses a callback started before credentials changed", async () => {
  await saveOneConfig(credentials);
  expect((await route("authorize", "", { "sec-fetch-site": "cross-site" })).status).toBe(403);
  const { query, cookie } = await startFlow();
  await saveOneConfig({ ...credentials, connectKey: "replacement-key" });
  const exchange = vi.fn();
  vi.stubGlobal("fetch", exchange);

  expect((await route("callback", query, { cookie })).headers.get("location")).toContain("one_connect=error");
  expect(exchange).not.toHaveBeenCalled();

  vi.mocked(getSession).mockResolvedValue(null);
  expect((await route("authorize")).status).toBe(401);
  expect((await route("callback", query, { cookie })).status).toBe(401);
});
