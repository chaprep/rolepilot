import { describe, expect, it } from "vitest";

import { parseThemeFile, themeFile, themeFileName } from "./theme-file";
import { BUILT_IN_THEMES } from "./themes";

const editorial = BUILT_IN_THEMES[0];

describe("theme margins", () => {
  it("round-trips custom margins, including zero", () => {
    expect(parseThemeFile(themeFile({ ...editorial, marginXmm: 0, marginYmm: 10.5 }))).toMatchObject({
      ok: true, theme: { marginXmm: 0, marginYmm: 10.5 },
    });
  });

  it("reads older theme files without margins", () => {
    const file = themeFile(editorial);
    const { marginXmm, marginYmm, ...older } = file.theme;
    expect([marginXmm, marginYmm]).toEqual([null, null]);
    expect(parseThemeFile({ ...file, version: 3, theme: older })).toMatchObject({
      ok: true, theme: { marginXmm: null, marginYmm: null },
    });
  });

  it.each([-0.5, 30.5, 10.25, Infinity, NaN, "10"])("rejects invalid margins: %s", (marginXmm) => {
    const file = themeFile(editorial);
    expect(parseThemeFile({ ...file, theme: { ...file.theme, marginXmm } }).ok).toBe(false);
  });
});

describe("theme files (E5-7)", () => {
  it("exports the look without ids, and reads it back", () => {
    const file = themeFile({ ...editorial, name: "Quiet green", accent: "#1F6F5C" });
    expect(file).toEqual({
      format: "dossier-theme",
      version: 4,
      theme: expect.not.objectContaining({ id: expect.anything() }),
    });
    const read = parseThemeFile(JSON.parse(JSON.stringify(file)));
    expect(read).toEqual({ ok: true, theme: { ...file.theme, accent: "#1f6f5c" } });
  });

  it("keeps the header, sidebar and date styles", () => {
    const atlas = BUILT_IN_THEMES.find((theme) => theme.id === "atlas")!;
    expect(parseThemeFile(themeFile({ ...atlas, sidebarStyle: "TINTED" }))).toMatchObject({
      ok: true,
      theme: { headFont: "LIBRE_CASLON", headerStyle: "BANNER", sidebarStyle: "TINTED", dateStyle: "TIMELINE" },
    });
  });

  it("reads version 1 files, which have no header, sidebar or date style, with the defaults", () => {
    const { name, headFont, bodyFont, accent, layout, align, headingStyle, density } = editorial;
    const look = { name, headFont, bodyFont, accent, layout, align, headingStyle, density };
    expect(parseThemeFile({ format: "dossier-theme", version: 1, theme: look })).toEqual({
      ok: true,
      theme: { ...look, marginXmm: null, marginYmm: null, headerStyle: "PLAIN", sidebarStyle: "PLAIN", dateStyle: "INLINE", photoShape: "CIRCLE", photoPosition: "HEADER_END" },
    });
  });

  it("keeps the photo's shape and position, and reads version 2 files without them with the defaults (#224)", () => {
    const modern = BUILT_IN_THEMES.find((theme) => theme.id === "modern")!;
    expect(parseThemeFile(themeFile({ ...modern, photoShape: "PORTRAIT" }))).toMatchObject({
      ok: true,
      theme: { photoShape: "PORTRAIT", photoPosition: "SIDEBAR" },
    });
    const { photoShape, photoPosition, ...look } = themeFile(modern).theme;
    expect([photoShape, photoPosition]).toEqual(["ROUNDED", "SIDEBAR"]);
    expect(parseThemeFile({ format: "dossier-theme", version: 2, theme: look })).toEqual({
      ok: true,
      theme: { ...look, photoShape: "CIRCLE", photoPosition: "HEADER_END" },
    });
  });

  it("refuses other files, newer versions, unknown fonts and bad colors, in plain words", () => {
    const file = themeFile(editorial);
    expect(parseThemeFile({ hello: "world" })).toEqual({ ok: false, error: "That file isn't a Dossier theme." });
    expect(parseThemeFile(null)).toEqual({ ok: false, error: "That file isn't a Dossier theme." });
    expect(parseThemeFile({ ...file, version: 5 })).toEqual({ ok: false, error: "That theme comes from a newer version of Dossier. Update this server first." });
    expect(parseThemeFile({ ...file, theme: { ...file.theme, headFont: "COMIC_SANS" } })).toEqual({
      ok: false,
      error: "That theme uses a font Dossier doesn't have (COMIC_SANS).",
    });
    expect(parseThemeFile({ ...file, theme: { ...file.theme, accent: "green" } })).toEqual({ ok: false, error: "That theme file is damaged (theme.accent)." });
  });

  it("names the file after the theme, safely", () => {
    expect(themeFileName({ name: "Quiet green" })).toBe("Quiet green.dossier-theme.json");
    expect(themeFileName({ name: 'A/B: "best"' })).toBe("A B best.dossier-theme.json");
    expect(themeFileName({ name: "   " })).toBe("Theme.dossier-theme.json");
  });
});
