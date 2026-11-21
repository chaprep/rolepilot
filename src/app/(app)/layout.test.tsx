import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import AppLayout from "./layout";

const state = vi.hoisted(() => ({ after: [] as (() => unknown)[] }));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => state.after.push(callback) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/session", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/agent/view", () => ({ countAgentQueue: async () => 0 }));
vi.mock("@/lib/google/inbox-data", () => ({ inboxCount: async () => 0 }));
vi.mock("@/lib/profile-data", () => ({ loadProfileName: async () => "Test User" }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/desktop", () => ({ isDesktopApp: () => false }));
vi.mock("@/lib/settings-data", () => ({ loadSettings: async () => ({
  setupGuide: {}, updateCheck: true, latestVersion: "99.0.0",
  latestVersionUrl: "https://github.com/chaprep/job-finder/releases/tag/v99.0.0",
  announcementFeed: { items: [{ id: "old", title: "Legacy announcement", body: "Old notice" }] },
  announcementsDismissed: [],
}) }));
vi.mock("@/lib/setup-guide", () => ({ opensSetupGuide: () => false, setupInProgress: () => false }));
vi.mock("@/lib/time-zone", () => ({ userTimeZone: async () => "UTC", rememberBrowserTimeZone: vi.fn() }));
vi.mock("./sidebar", () => ({ Sidebar: () => <aside>Navigation</aside> }));

afterEach(() => { state.after.length = 0; vi.unstubAllGlobals(); });

it("renders signed-in pages without fetching updates or showing cached notices", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(await AppLayout({ params: Promise.resolve({}), children: <p>Application content</p> }));
  await Promise.all(state.after.map((callback) => callback()));
  expect(screen.getByText("Application content")).toBeInTheDocument();
  expect(screen.getByText("Navigation")).toBeInTheDocument();
  expect(screen.queryByText(/99\.0\.0|Legacy announcement/)).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
