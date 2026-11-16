import type { ApplicationEvidence } from "@/lib/application-data";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApplicationEvidenceForm } from "./application-evidence-form";

describe("application evidence form", () => {
  it("requires supporting experience before submitting", async () => {
    const save = vi.fn(async () => true);
    render(<ApplicationEvidenceForm skill="Figma" index={2} options={[]} onSave={save} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save for this application" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Describe your supporting experience");
    expect(save).not.toHaveBeenCalled();
  });
  it("submits the selected role with a stable identifier across a retry", async () => {
    const save = vi.fn<(evidence: ApplicationEvidence) => Promise<boolean>>(async () => false);
    const cancel = vi.fn();
    render(<ApplicationEvidenceForm skill="Figma" index={2} options={[{ id: "experience:e1", label: "Designer at Acme" }]} onSave={save} onCancel={cancel} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Supporting experience" }), "Built prototypes.");
    await userEvent.selectOptions(screen.getByLabelText("Role or project (optional)"), "experience:e1");
    await userEvent.click(screen.getByRole("button", { name: "Save for this application" }));
    await userEvent.click(screen.getByRole("button", { name: "Save for this application" }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
    expect(save.mock.calls[0][0]).toMatchObject({ requirementIndex: 2, targetUnitId: "experience:e1", text: "Built prototypes." });
    expect(cancel).not.toHaveBeenCalled();
  });
  it("keeps text after a failed save and closes only on success", async () => {
    const save = vi.fn(async () => true).mockRejectedValueOnce(new Error("Offline"));
    const cancel = vi.fn();
    render(<ApplicationEvidenceForm skill="Figma" index={0} options={[]} onSave={save} onCancel={cancel} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Supporting experience" }), "Built prototypes.");
    await userEvent.click(screen.getByRole("button", { name: "Save for this application" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your text is still here");
    expect(screen.getByRole("textbox", { name: "Supporting experience" })).toHaveValue("Built prototypes.");
    await userEvent.click(screen.getByRole("button", { name: "Save for this application" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
