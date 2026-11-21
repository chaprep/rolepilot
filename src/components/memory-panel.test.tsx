import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryPanel } from "./memory-panel";

const api = vi.hoisted(() => ({
  clarifyMemory: vi.fn(async () => ({ ok: true })),
  listMemories: vi.fn(), correctRememberedFact: vi.fn(async () => ({ ok: true })), forgetRememberedFact: vi.fn(async () => ({ ok: true })), retryMemory: vi.fn(async () => ({ ok: true })), pauseMemory: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/memory/actions", () => api);
vi.mock("@/components/toast", () => ({ toast: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  api.listMemories.mockResolvedValue({ ok: true, data: { facts: [{ id: "m1", revision: 2, text: "I used Docker.", status: "ACTIVE", context: "Company X", detached: false, evidence: [{ quote: "I used Docker.", applicationId: "a" }] }], count: 1, pending: 2, failed: 1, paused: false, backfill: null } });
});
describe("remembered information controls", () => {
  it("shows automatic status and links to sources without a save opt-in", async () => {
    render(<MemoryPanel />);
    expect(await screen.findByText("1 remembered · 2 processing · 1 need retry")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Sources"));
    expect(screen.getByRole("link", { name: "Open application" })).toHaveAttribute("href", "/applications/a");
  });
  it("submits a correction with optimistic revision rather than overwriting silently", async () => {
    render(<MemoryPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /^Correct$/ }));
    const input = screen.getByLabelText("Correct remembered information");
    await userEvent.clear(input);
    await userEvent.type(input, "I used Podman.");
    await userEvent.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(api.correctRememberedFact).toHaveBeenCalledWith({ id: "m1", revision: 2, text: "I used Podman.", unitId: null }));
  });
  it("forgets the selected memory and offers independent retry and pause controls", async () => {
    render(<MemoryPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Forget" }));
    expect(api.forgetRememberedFact).toHaveBeenCalledWith({ id: "m1", revision: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Retry processing" }));
    expect(api.retryMemory).toHaveBeenCalledWith({});
    await userEvent.click(screen.getByRole("button", { name: "Pause memory" }));
    expect(api.pauseMemory).toHaveBeenCalledWith({ paused: true });
  });
});
