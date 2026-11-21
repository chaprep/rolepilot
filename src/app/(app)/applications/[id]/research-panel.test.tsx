// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { startRefreshingResearch } from "./actions";
import { ResearchPanel } from "./research-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-job", () => ({ useJob: () => null }));
vi.mock("./actions", () => ({ startRefreshingResearch: vi.fn(async () => ({ ok: true, data: "job-1" })) }));

it("shows partial findings with source links and starts a refresh for this application", async () => {
  const user = userEvent.setup();
  render(<ResearchPanel applicationId="app-1" data={{ enabled: true, jobId: null, saved: {
    status: "partial",
    sources: [{ id: "S1", title: "Ledgerly careers", url: "https://ledgerly.com/careers", retrievedAt: "2026-11-20T00:00:00.000Z" }],
  } }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Partial research");
  expect(screen.getByRole("link", { name: "Ledgerly careers" })).toHaveAttribute("href", "https://ledgerly.com/careers");
  await user.click(screen.getByRole("button", { name: "Refresh research" }));
  expect(startRefreshingResearch).toHaveBeenCalledWith({ id: "app-1" });
  expect(screen.getByRole("status")).toHaveTextContent("Preparing research");
});

it("shows when research is unavailable", () => {
  render(<ResearchPanel applicationId="app-1" data={{ enabled: false, jobId: null, saved: { status: "unavailable", sources: [] } }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Research unavailable");
});
