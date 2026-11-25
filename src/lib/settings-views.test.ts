import { headers } from "next/headers";
import { expect, it, vi } from "vitest";

import { googleConnection } from "@/lib/google/account";
import { loadGoogleClientConfig } from "@/lib/google/oauth";

import { googleClientView, googleView, requestOrigin, whenRan } from "./settings-views";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/google/account", () => ({ googleConnection: vi.fn() }));
vi.mock("@/lib/google/oauth", () => ({ loadGoogleClientConfig: vi.fn() }));

it.each([
  [{}, "http://localhost:3000"],
  [{ host: "rolepilot.example" }, "https://rolepilot.example"],
  [{ host: "app:3000", "x-forwarded-host": " rolepilot.example , proxy", "x-forwarded-proto": " https , http" }, "https://rolepilot.example"],
  [{ host: "localhost:3001", "x-forwarded-proto": "https" }, "https://localhost:3001"],
] as const)("calculates the callback origin from the request headers %j", async (input, expected) => {
  vi.mocked(headers).mockResolvedValue(new Headers(input));
  await expect(requestOrigin()).resolves.toBe(expected);
});

it("formats sync dates relative to the local calendar day", () => {
  const now = new Date(2026, 10, 25, 1, 15);
  expect(whenRan(null, now)).toBeNull();
  expect(whenRan(new Date(2026, 10, 25, 0, 30), now)).toBe("today at 00:30");
  expect(whenRan(new Date(2026, 10, 24, 23, 45), now)).toBe("yesterday at 23:45");
  expect(whenRan(new Date(2026, 10, 22, 3, 5), now)).toBe("on 22 Nov at 03:05");
});

it("shows the connection state and formats the last sync for a connected account", async () => {
  vi.mocked(googleConnection).mockResolvedValueOnce({ status: "disconnected" });
  await expect(googleView()).resolves.toEqual({ status: "disconnected" });
  vi.mocked(googleConnection).mockResolvedValueOnce({
    status: "connected", email: "person@example.com", canSend: true, canRead: true,
    canUseCalendar: false, lastSyncAt: null, syncProblem: null, signInProblem: null,
  });
  await expect(googleView()).resolves.toEqual({
    status: "connected", email: "person@example.com", canSend: true, canRead: true,
    canUseCalendar: false, lastSync: null, syncProblem: null, signInProblem: null,
  });
});

it("exposes OAuth configuration status without exposing the client secret", async () => {
  vi.mocked(loadGoogleClientConfig).mockResolvedValue({
    client: { id: "client-id", secret: "private-secret" }, id: "client-id", idState: "set", secretState: "env",
  });
  await expect(googleClientView()).resolves.toEqual({ id: "client-id", idState: "set", secretState: "env" });
});
