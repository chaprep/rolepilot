// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { saveZyteKey, setCompanyResearch, testZyteConnection } from "./research-actions";
import { ResearchSection } from "./research-section";

vi.mock("./research-actions", () => ({ saveZyteKey: vi.fn(), testZyteConnection: vi.fn(), setCompanyResearch: vi.fn() }));

it("keeps research disabled until the saved key passes its test, then supports enabling and clearing it", async () => {
  const user = userEvent.setup();
  vi.mocked(saveZyteKey).mockResolvedValueOnce({ ok: true, data: { keyState: "set", enabled: false, verified: false } })
    .mockResolvedValueOnce({ ok: true, data: { keyState: "none", enabled: false, verified: false } });
  vi.mocked(testZyteConnection).mockResolvedValueOnce({ ok: false, error: "Search unavailable" })
    .mockResolvedValueOnce({ ok: true, data: { keyState: "set", enabled: false, verified: true } });
  vi.mocked(setCompanyResearch).mockResolvedValue({ ok: true, data: { keyState: "set", enabled: true, verified: true } });

  render(<ResearchSection initial={{ keyState: "none", enabled: false, verified: false }} />);
  const toggle = screen.getByRole("switch", { name: "Research companies for new cover letters" });
  const field = screen.getByLabelText("Zyte API key");
  expect(toggle).toBeDisabled();
  await user.type(field, "test-secret");
  await user.click(screen.getByRole("button", { name: "Save Zyte key" }));
  expect(saveZyteKey).toHaveBeenLastCalledWith({ action: "set", value: "test-secret" });
  await waitFor(() => expect(field).toHaveValue(""));
  expect(toggle).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Test Zyte connection" }));
  expect(await screen.findByText("Search unavailable")).toBeVisible();
  expect(toggle).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Test Zyte connection" }));
  await waitFor(() => expect(toggle).toBeEnabled());
  await user.click(toggle);
  expect(setCompanyResearch).toHaveBeenLastCalledWith({ enabled: true });
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  await user.click(screen.getByRole("button", { name: "Remove Zyte key" }));
  expect(saveZyteKey).toHaveBeenLastCalledWith({ action: "clear" });
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(toggle).toBeDisabled();
});
