import { describe, expect, it } from "vitest";
import { applyDocumentOperation, documentStateSchema, documentStyleRules, stateForPrompt, validateDocumentUnits } from "./document-state";
import { demoDocumentState } from "@/test/document-state";
import { demoResumeUnits } from "./demo-profile";

describe("independent document operations", () => {
  it("changes metadata, margins and unit styles without touching the original inputs", () => {
    const before = demoDocumentState();
    let state = structuredClone(before);
    const units = demoResumeUnits();
    state = applyDocumentOperation(state, units, { type: "metadata", document: "RESUME", path: "experience.e1.role", json: '"Principal Designer"' });
    state = applyDocumentOperation(state, units, { type: "settings", document: "RESUME", json: '{"theme":{"marginXmm":8,"layout":"SPLIT_END"},"followThemeLayout":true}' });
    state = applyDocumentOperation(state, units, { type: "style", document: "RESUME", target: "unit:summary", json: '{"fontSize":11,"lineHeight":1.2,"color":"#123456"}' });
    expect(state.profile.experience[0].role).toBe("Principal Designer");
    expect(before.profile.experience[0].role).not.toBe("Principal Designer");
    expect(state.theme.marginXmm).toBe(8);
    expect(documentStyleRules("resume", state.styles, "A4")).toContain('[data-unit="summary"]');
    expect(documentStyleRules("resume", state.styles, "A4")).toContain("#123456");
  });
  it("adds a custom section and text unit, then validates their relationship", () => {
    let state = demoDocumentState();
    const units = demoResumeUnits();
    state = applyDocumentOperation(state, units, { type: "entry", document: "RESUME", collection: "customSections", action: "upsert", id: "local-awards", json: JSON.stringify({ title: "Awards", format: "LINES", items: [{ id: "local-award", title: "Design award", onResumes: true }] }), beforeId: null });
    state = applyDocumentOperation(state, units, { type: "unit", document: "RESUME", action: "upsert", id: "custom-line:local-award", label: "Award", text: "Design award", beforeId: null });
    expect(state.sections.order).toContain("custom:local-awards");
    expect(() => validateDocumentUnits(state, units, "RESUME")).not.toThrow();
    units.push({ id: "experience:unknown", label: "Unknown", text: "Ignored?" });
    expect(() => validateDocumentUnits(state, units, "RESUME")).toThrow("no matching entry");
  });
  it("rejects unsafe values, impossible geometry, unknown targets and prototype paths", () => {
    const state = demoDocumentState();
    for (const json of ['{"fontSize":-2}', '{"font":"UNKNOWN"}', '{"color":"red;display:none"}', '{"css":"display:none"}']) {
      expect(() => applyDocumentOperation(structuredClone(state), [], { type: "style", document: "RESUME", target: "document", json })).toThrow();
    }
    expect(() => applyDocumentOperation(structuredClone(state), [], { type: "settings", document: "RESUME", json: '{"theme":{"marginXmm":110}}' })).toThrow("Margins");
    expect(() => applyDocumentOperation(structuredClone(state), [], { type: "metadata", document: "RESUME", path: "basics.__proto__", json: '{}' })).toThrow();
    expect(() => applyDocumentOperation(structuredClone(state), [], { type: "style", document: "RESUME", target: "body{display:none}", json: '{}' })).toThrow();
    expect(() => documentStateSchema.parse({ ...state, theme: { ...state.theme, marginYmm: Infinity } })).toThrow();
  });
  it("keeps email plain text and allows paragraph insertion/reordering for letters", () => {
    let state = demoDocumentState();
    const units = [{ id: "paragraph:1", label: "Opening", text: "Hello" }];
    state = applyDocumentOperation(state, units, { type: "unit", document: "COVER_LETTER", action: "upsert", id: "paragraph:local-new", label: "New paragraph", text: "More", beforeId: "paragraph:1" });
    expect(units.map(unit => unit.id)).toEqual(["paragraph:local-new", "paragraph:1"]);
    expect(() => applyDocumentOperation(state, units, { type: "style", document: "EMAIL", target: "document", json: '{"fontSize":11}' })).toThrow("plain-text");
  });
  it("redacts private details and photos from ordinary model context", () => {
    const state = demoDocumentState();
    state.profile.basics.phone = "SECRET-PHONE";
    state.profile.facts = [{ id: "private", text: "SECRET-FACT" }];
    state.profile.references = [{ id: "ref", name: "Ref", relation: "Manager", company: "Acme", email: "SECRET-REFERENCE", phone: "" }];
    const context = JSON.stringify(stateForPrompt(state));
    expect(context).not.toContain("SECRET-");
    expect(state.profile.basics.phone).toBe("SECRET-PHONE");
  });
});


it("selects an existing theme without editing it and resets local appearance", () => {
  const state = demoDocumentState(); state.styles.document = { fontSize: 12 };
  const changed = applyDocumentOperation(state, demoResumeUnits(), { type: "settings", document: "RESUME", json: '{"themeId":"modern"}' });
  expect(changed.theme.id).toBe("modern");
  expect(changed.theme.layout).toBe("SPLIT");
  expect(changed.followThemeLayout).toBe(true);
  expect(changed.styles).toEqual({});
});


it("applies an explicitly changed letter date to an existing date unit", () => {
  const units = [{ id: "date", label: "Date", text: "Old displayed date" }];
  applyDocumentOperation(demoDocumentState(), units, { type: "settings", document: "COVER_LETTER", json: '{"letterDate":"2026-12-01T00:00:00.000Z"}' });
  expect(units[0].text).toBe("1 December 2026");
});
