import { describe, expect, it } from "vitest";
import { LETTER_NAVY, letterFormatting, sidebarLetterTheme, sidebarLetterUnits } from "./cover-letter-format";
import { BUILT_IN_THEMES } from "./themes";
import { withoutPrivateParts } from "./letter-frame";
import { applyDocumentOperation } from "./document-state";
import { demoDocumentState } from "@/test/document-state";

const old = [{ id: "sender", label: "Sender", text: "Jane Doe\nLondon · jane@example.com\n+44 1234567890" }, { id: "paragraph:1", label: "Opening", text: "Existing body." }];

describe("Sidebar cover-letter format", () => {
  it("splits the sender without rewriting content and keeps an existing headline/contact override", () => {
    const before = structuredClone(old);
    const split = sidebarLetterUnits(old, "Product Designer");
    expect(split.map(unit => unit.id)).toEqual(["sender", "headline", "contacts", "paragraph:1"]);
    expect(split[0].text).toBe("Jane Doe");
    expect(split[1].text).toBe("Product Designer");
    expect(split[2].text).toBe("London · jane@example.com\n+44 1234567890");
    expect(sidebarLetterUnits(split, "Other role")).toEqual(split);
    expect(old).toEqual(before);
    expect(withoutPrivateParts(split).map(unit => unit.id)).toEqual(["headline", "paragraph:1"]);
  });
  it("uses local Inter/navy defaults and preserves margins and explicit formatting", () => {
    const base = { ...BUILT_IN_THEMES[0], marginXmm: 9, marginYmm: 12 };
    const theme = sidebarLetterTheme(base);
    expect(theme).toMatchObject({ headFont: "INTER", bodyFont: "INTER", accent: LETTER_NAVY, marginXmm: 9, marginYmm: 12 });
    expect(base.accent).not.toBe(LETTER_NAVY);
    const formatting = letterFormatting("SIDEBAR", { document: { fontSize: 12 }, name: { color: "#123456" } })!;
    expect(formatting.document).toMatchObject({ fontSize: 12, lineHeight: 1.35 });
    expect(formatting.name).toMatchObject({ fontSize: 24, color: "#123456" });
    expect(letterFormatting("CLASSIC")).toBeUndefined();
  });
  it("applies the layout through existing refinement operations, including role editing", () => {
    const units = structuredClone(old);
    let state = demoDocumentState(); state.role = "GTM Engineer";
    state = applyDocumentOperation(state, units, { type: "settings", document: "COVER_LETTER", json: '{"coverLetterLayout":"SIDEBAR"}' });
    expect(state.coverLetterLayout).toBe("SIDEBAR");
    expect(units.find(unit => unit.id === "headline")?.text).toBe("GTM Engineer");
    state = applyDocumentOperation(state, units, { type: "metadata", document: "COVER_LETTER", path: "basics.headline", json: '"Senior GTM Engineer"' });
    expect(units.find(unit => unit.id === "headline")?.text).toBe("Senior GTM Engineer");
    state = applyDocumentOperation(state, units, { type: "metadata", document: "COVER_LETTER", path: "basics.phone", json: '"+44 1111111111"' });
    expect(units.find(unit => unit.id === "contacts")?.text).toContain("+44 1111111111");
    expect(units.find(unit => unit.id === "sender")?.text).toBe("Jane Doe");
    expect(() => applyDocumentOperation(state, [], { type: "settings", document: "RESUME", json: '{"coverLetterLayout":"SIDEBAR"}' })).toThrow("only applies");
  });
});
