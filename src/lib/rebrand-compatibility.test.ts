import { legacyCiphertext } from "@/test/legacy-secret";
import { describe, expect, it, vi } from "vitest";
import { AI_API_KEY, JOB_SOURCE_KEY, TYPESAFE_KEY, GOOGLE_TOKEN, GOOGLE_CLIENT_SECRET, applySecretChange, decryptSecret } from "./secrets";
import { themeFile, parseThemeFile } from "./theme-file";
import { BUILT_IN_THEMES } from "./themes";
import { createDraftStore } from "@/app/(app)/new/draft-store";
vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "a".repeat(32) } }));

describe("legacy rebrand compatibility", () => {
  it("reads and upgrades all credential kinds without changing their value", () => {
    for (const kind of [AI_API_KEY, JOB_SOURCE_KEY, TYPESAFE_KEY, GOOGLE_TOKEN, GOOGLE_CLIENT_SECRET]) {
      const old = legacyCiphertext(kind, "existing-value");
      expect(decryptSecret(kind, old)).toBe("existing-value");
      const upgraded = applySecretChange(kind, old, { action: "keep" })!;
      expect(upgraded).toMatch(/^v2\./);
      expect(decryptSecret(kind, upgraded)).toBe("existing-value");
    }
  });

  it("keeps unreadable legacy credentials recoverable when saving unrelated settings", () => {
    expect(applySecretChange(AI_API_KEY, "v1.damaged.value", { action: "keep" })).toBe("v1.damaged.value");
  });

  it("accepts historical theme files and emits the new format", () => {
    const current = themeFile(BUILT_IN_THEMES[0]);
    expect(current.format).toBe("rolepilot-theme");
    expect(parseThemeFile({ ...current, format: "dossier-theme" })).toMatchObject({ ok: true, theme: current.theme });
    expect(parseThemeFile({ format: "dossier-theme", version: 999 })).toMatchObject({ ok: false, error: expect.stringContaining("newer") });
  });

  it("moves tab drafts once and does not resurrect a cleared legacy draft", () => {
    const values = new Map([["dossier:new-application", JSON.stringify({ version: 1, draft: { title: "Saved" } })]]);
    vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
    try {
      const store = createDraftStore();
      expect(store.get()).toEqual({ title: "Saved" });
      expect(values.has("dossier:new-application")).toBe(false);
      store.clear();
      expect(createDraftStore().get()).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
