import { createOneConnect } from "@withone/connect/server";
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

import { loadOneSetup } from "@/lib/one/config";

import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({}) }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/one/config", () => ({
  loadOneSetup: vi.fn(),
  ONE_RETURN: "/settings?section=ai",
}));

const origin = "http://127.0.0.1:3001";
const host = new URL(origin).host;
const redirectUri = `${origin}/api/one/callback`;

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["?from=welcome", "/welcome?step=ai"],
  ["", "/settings?section=ai"],
])("returns to the page that began One authorization (%s)", async (query, returnTo) => {
  const saveUser = vi.fn();
  vi.mocked(loadOneSetup).mockImplementation(async (destination) => ({
    connect: createOneConnect({
      clientId: "test-client",
      clientSecret: "test-secret",
      connectKey: "test-connect-key",
      redirectUri,
      returnTo: destination,
      userStore: { loadUser: async () => null, saveUser, clearUser: async () => {} },
    }),
    config: { clientId: "test-client", clientSecret: "test-secret", connectKey: "test-connect-key", redirectUri, permissionSet: "test-ask" },
    userId: "test-owner",
    revision: "test-revision",
    ciphertext: "test-config",
    reference: null,
    connectionKey: null,
    muapiConnectionKey: null,
  }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ connect_user_id: `cu_${"a".repeat(64)}`, access_token: "test" })));

  const start = await GET(new NextRequest(`${origin}/api/one/authorize${query}`, { headers: { host } }), { params: Promise.resolve({ action: "authorize" }) });
  const consent = new URL(start.headers.get("location")!);
  expect(consent.origin).toBe("https://api.withone.ai");
  expect(consent.searchParams.get("redirect_uri")).toBe(redirectUri);
  const cookie = start.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
  const callback = new URL(redirectUri);
  callback.searchParams.set("state", consent.searchParams.get("state")!);
  callback.searchParams.set("code", "test-code");
  const complete = await GET(new NextRequest(callback, { headers: { host, cookie } }), { params: Promise.resolve({ action: "callback" }) });

  expect(complete.headers.get("location")).toBe(`${origin}${returnTo}&one_connect=success`);
  expect(saveUser).toHaveBeenCalledOnce();
});
