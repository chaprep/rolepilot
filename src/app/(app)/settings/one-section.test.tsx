import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { checkOneSetup, removeOneSetup, saveOneSetup } from "./one-actions";
import { OneSection } from "./one-section";

vi.mock("./one-actions", () => ({ checkOneSetup: vi.fn(), removeOneSetup: vi.fn(), saveOneSetup: vi.fn() }));

const unconfigured = {
  clientId: "", permissionSet: "", redirectUri: "http://localhost:3000/api/one/callback",
  saved: false, connected: false, unreadable: false, tested: false, muapiTested: false,
};
const saved = { ...unconfigured, clientId: "client", permissionSet: "permissions", saved: true };
const connected = { ...saved, connected: true };

const button = (name: string) => screen.getByRole("button", { name });
const enter = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => vi.resetAllMocks());

it("keeps setup optional and enables authorization only after saving credentials", async () => {
  vi.mocked(saveOneSetup).mockResolvedValue({ ok: true, data: saved });
  render(<OneSection initial={unconfigured} inGuide />);
  expect(screen.getByRole("heading", { name: "One · Optional" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open One dashboard" })).toHaveAttribute("href", "https://app.withone.ai/developers/connect");
  fireEvent.click(screen.getByText("Enter One Connect credentials"));
  expect(button("Connect with One")).toBeDisabled();
  expect(button("Save One settings")).toBeDisabled();
  enter("One Connect key", "connect-key");
  enter("One client ID", saved.clientId);
  enter("One client secret", "client-secret");
  enter("One permission set ID", saved.permissionSet);
  fireEvent.click(button("Save One settings"));
  await screen.findByText(/One settings saved\. Connect with One/);
  expect(saveOneSetup).toHaveBeenCalledWith({
    clientId: saved.clientId, permissionSet: saved.permissionSet, redirectUri: saved.redirectUri,
    connectKey: "connect-key", clientSecret: "client-secret",
  });
  expect(screen.getByLabelText("One Connect key")).toHaveValue("");
  expect(screen.getByLabelText("One client secret")).toHaveValue("");
  expect(button("Connect with One")).toBeEnabled();
  expect(button("Test connection")).toBeDisabled();
});

it("shows grant-specific results and disables tests while changing the callback", async () => {
  vi.mocked(checkOneSetup)
    .mockResolvedValueOnce({ ok: true, data: { view: { ...connected, tested: true }, error: null } })
    .mockResolvedValueOnce({ ok: true, data: { view: { ...connected, tested: true, muapiTested: true }, error: null } });
  render(<OneSection initial={connected} outcome="success" />);
  expect(screen.getByRole("status")).toHaveTextContent("One authorized.");
  enter("One callback URL", "https://rolepilot.example/api/one/callback");
  expect(button("Test connection")).toBeDisabled();
  expect(button("Reconnect with One")).toBeDisabled();
  enter("One callback URL", connected.redirectUri);
  fireEvent.click(button("Test connection"));
  await screen.findByText("Exa permissions checked. Authorize Muapi for LinkedIn people search.");
  fireEvent.click(button("Test connection"));
  await screen.findByText("Exa and Muapi permissions checked.");
  expect(checkOneSetup).toHaveBeenCalledTimes(2);
});

it("reports failures and clears local connection details only after successful removal", async () => {
  vi.mocked(checkOneSetup).mockResolvedValue({ ok: false, error: "One is unavailable." });
  vi.mocked(removeOneSetup)
    .mockResolvedValueOnce({ ok: false, error: "Could not remove the connection." })
    .mockResolvedValueOnce({ ok: true, data: unconfigured });
  render(<OneSection initial={connected} outcome="error" />);
  expect(screen.getByRole("status")).toHaveTextContent("One couldn’t connect.");
  fireEvent.click(button("Test connection"));
  await screen.findByText("One is unavailable.");
  fireEvent.click(button("Remove One settings"));
  await screen.findByText("Could not remove the connection.");
  expect(screen.getByLabelText("One client ID")).toHaveValue(connected.clientId);
  fireEvent.click(button("Remove One settings"));
  await screen.findByText("One settings removed from Rolepilot.");
  expect(screen.getByLabelText("One client ID")).toHaveValue("");
  expect(button("Connect with One")).toBeDisabled();
});

it("allows replacing unreadable credentials and surfaces save errors", async () => {
  vi.mocked(saveOneSetup).mockResolvedValue({ ok: false, error: "Enter the client secret." });
  render(<OneSection initial={{ ...saved, unreadable: true }} />);
  expect(screen.getByText(/saved credentials couldn’t be read/)).toBeVisible();
  enter("One Connect key", "replacement-key");
  fireEvent.click(button("Save One settings"));
  await screen.findByText("Enter the client secret.");
  expect(button("Connect with One")).toBeDisabled();
  expect(button("Save One settings")).toBeEnabled();
});
