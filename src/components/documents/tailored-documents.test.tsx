import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { demoDocumentState } from "@/test/document-state";
import { demoLetterUnits, demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import { BUILT_IN_THEMES } from "@/lib/themes";
import { TailoredLetter, TailoredResume } from "./tailored-documents";

describe("application-local document rendering", () => {
  it("uses local metadata, structure, paper, typography and inline marks instead of global inputs", () => {
    const state = demoDocumentState();
    state.profile.basics.name = "Local candidate";
    state.profile.experience[0].role = "Principal Designer";
    state.paper = "LETTER";
    state.dateLabels["experience:e1"] = "Summer 2022 to present";
    state.theme.marginXmm = 8;
    state.sections.order = ["skills", "experience", "summary", ...state.sections.order.filter(key => !["skills", "experience", "summary"].includes(key))];
    state.styles = { document: { fontSize: 11, lineHeight: 1.2 }, "unit:summary": { color: "#123456" } };
    const units = demoResumeUnits().map(unit => unit.id === "summary" ? { ...unit, text: "A **bold** summary with __underline__ and ==highlight==." } : unit);
    const { container } = render(<TailoredResume resume={{ theme: BUILT_IN_THEMES[0], units, state }} profile={demoProfile()} paper="A4" followThemeLayout={false} showPhoto={false} language="English" includeReferences={false} sections={{ order: [], off: [] }} />);
    expect(screen.getByRole("heading", { name: "Local candidate" })).toBeInTheDocument();
    expect(screen.getByText("Principal Designer")).toBeInTheDocument();
    expect(screen.getByText("Summer 2022 to present")).toBeInTheDocument();
    const page = screen.getByRole("article", { name: "Resume" });
    expect(page.style.getPropertyValue("--paper-width")).toBe("215.9");
    expect(container.querySelector("[data-unit=summary] strong")).toHaveTextContent("bold");
    expect(container.querySelector("[data-unit=summary] u")).toHaveTextContent("underline");
    expect(container.querySelector("[data-unit=summary] mark")).toHaveTextContent("highlight");
    expect(container.querySelector("style")?.textContent).toContain("#123456");
    expect([...container.querySelectorAll("[data-section]")].slice(0, 2).map(el => el.getAttribute("data-section"))).toEqual(["skills", "experience"]);
  });
  it("renders an independent cover letter and inserted paragraphs", () => {
    const state = demoDocumentState();
    state.profile.basics.name = "Letter candidate";
    state.styles = { "unit:paragraph:local-new": { italic: true } };
    state.paper = "LETTER";
    const units = [...demoLetterUnits(), { id: "paragraph:local-new", label: "Extra paragraph", text: "New **letter content**." }];
    const { container } = render(<TailoredLetter letter={{ theme: BUILT_IN_THEMES[0], units, state }} profile={demoProfile()} paper="A4" company="Global company" location="Global place" tone="FORMAL" date={new Date()} dateFormat="NUMERIC" language="English" />);
    expect(container.textContent).toContain("Letter candidate");
    expect(container.querySelector('[data-unit="paragraph:local-new"] strong')).toHaveTextContent("letter content");
    expect(container.querySelector("style")?.textContent).toContain("font-style:italic");
  });
});
