import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";

import { updateSettings } from "./actions";
import { AiBehaviour } from "./ai-behaviour";

vi.mock("./actions", () => ({ updateSettings: vi.fn(async () => ({ ok: true, data: null })) }));
vi.mock("@/components/toast", () => ({
  toast: vi.fn(),
  toastResult: (result: { ok: boolean; error?: string }) => {
    if (!result.ok) toast(result.error!);
    return result;
  },
}));

const initial = { creativity: "BALANCED" as const, strict: true, showDiff: true };

beforeEach(() => vi.mocked(updateSettings).mockClear());

describe("AI behaviour (E10-2)", () => {
  it("has creativity and two labelled switches", () => {
    render(<AiBehaviour initial={initial} />);
    expect(screen.getByRole("radiogroup", { name: "Writing approach" })).toHaveAccessibleDescription(
      "Faithful stays close to your wording. Balanced highlights relevant evidence. Optimized maximizes transferable capabilities for the job while preserving your history and metrics.",
    );
    expect(screen.getByRole("radio", { name: "Balanced" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Strict factual review" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Show what changed" })).toHaveAccessibleDescription(
      "After each draft, list what was tailored compared with your base resume.",
    );
  });

  it("saves each change", async () => {
    const user = userEvent.setup();
    render(<AiBehaviour initial={initial} />);
    await user.click(screen.getByRole("radio", { name: "Faithful" }));
    expect(updateSettings).toHaveBeenLastCalledWith({ creativity: "FAITHFUL" });
    await user.click(screen.getByRole("switch", { name: "Show what changed" }));
    expect(updateSettings).toHaveBeenLastCalledWith({ showDiff: false });
  });

  it("saves Optimized and explains its factual boundaries", async () => {
    const user = userEvent.setup();
    render(<AiBehaviour initial={initial} />);
    expect(screen.queryByRole("radio", { name: "Expressive" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Optimized" }));
    expect(updateSettings).toHaveBeenLastCalledWith({ creativity: "OPTIMIZED" });
    expect(screen.getByRole("radio", { name: "Optimized" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Strict factual review" })).toHaveAccessibleDescription(
      "Optimized uses its own factual boundaries. This switch controls automatic factual review warnings; it does not restrict transferable skills.",
    );
  });

  it("warns when drafts may stretch beyond the profile", async () => {
    const user = userEvent.setup();
    render(<AiBehaviour initial={initial} />);
    expect(screen.queryByText(/^Heads up/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Strict factual review" }));
    expect(updateSettings).toHaveBeenLastCalledWith({ strict: false });
    expect(screen.getByRole("status")).toHaveTextContent("Automatic factual review warnings are off. Review your draft before sending.");
  });

  it("goes back when a save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSettings).mockResolvedValueOnce({ ok: false, error: "Couldn't save." });
    render(<AiBehaviour initial={initial} />);
    await user.click(screen.getByRole("switch", { name: "Show what changed" }));
    expect(screen.getByRole("switch", { name: "Show what changed" })).toHaveAttribute("aria-checked", "true");
    expect(toast).toHaveBeenCalledWith("Couldn't save.");
  });
});
