import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";

import { updateSettings } from "./actions";
import { DocumentsSection, type DocumentSettings } from "./documents-section";

vi.mock("./actions", () => ({
  updateSettings: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

const initial: DocumentSettings = {
  documentsToWrite: "both",
  paper: "A4",
  dateFormat: "DAY_MONTH_YEAR",
  defaultTone: "WARM",
  fileNamePattern: "{name} – {company} – {doc}",
  includeRefs: false,
};
const preview = { name: "Jane Doe", company: "Ledgerly", role: "Senior Product Designer" };
const open = () => render(<DocumentsSection initial={initial} preview={preview} />);

beforeEach(() => {
  vi.mocked(updateSettings).mockClear();
  vi.mocked(toast).mockClear();
});

describe("Documents settings (E10-3)", () => {
  it("has the defaults for every new application", () => {
    open();
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByText("New drafts are written in English. Existing documents and the languages listed in your profile are preserved.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();
    expect(screen.getByText("Defaults for every new application. You can still change them per job.")).toBeInTheDocument();
    expect(screen.getByLabelText("Paper size")).toHaveDisplayValue("A4");
    expect(screen.getByLabelText("Date format")).toHaveDisplayValue("27 September 2026");
    expect(screen.getByLabelText("Cover letter tone")).toHaveDisplayValue("Warm");
    expect(screen.getByRole("switch", { name: "Include references" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Documents to write")).toHaveDisplayValue("Resume and cover letter");
  });


  it("saves each choice at once", async () => {
    const user = userEvent.setup();
    open();
    await user.selectOptions(screen.getByLabelText("Paper size"), "LETTER");
    expect(updateSettings).toHaveBeenLastCalledWith({ paper: "LETTER" });
    await user.click(screen.getByRole("switch", { name: "Include references" }));
    expect(updateSettings).toHaveBeenLastCalledWith({ includeRefs: true });
  });

  it("chooses which documents New application writes (#367)", async () => {
    const user = userEvent.setup();
    open();
    const select = screen.getByLabelText("Documents to write") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Resume and cover letter", "Resume only", "Cover letter only"]);
    await user.selectOptions(select, "Resume only");
    expect(updateSettings).toHaveBeenLastCalledWith({ documentsToWrite: "resume" });
  });




  it("inserts file name tokens at the cursor and previews the name", async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByRole("status")).toHaveTextContent("Jane Doe – Ledgerly – Resume.pdf");
    const input = screen.getByLabelText("PDF file name") as HTMLInputElement;
    input.setSelectionRange(0, 0);
    await user.click(screen.getByRole("button", { name: "{date} Download date" }));
    expect(input).toHaveValue("{date}{name} – {company} – {doc}");
    expect(screen.getByRole("status").textContent).toMatch(/^\d{4}-\d{2}-\d{2}Jane Doe – Ledgerly – Resume\.pdf$/);
  });
});
