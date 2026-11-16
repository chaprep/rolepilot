import { demoProfile } from "@/lib/demo-profile";
import { documentStateSchema } from "@/lib/document-state";
import { DEFAULT_SECTION_LAYOUT } from "@/lib/resume-sections";
import { BUILT_IN_THEMES } from "@/lib/themes";

export function demoDocumentState() {
  return documentStateSchema.parse({ version: 1, profile: demoProfile(), theme: BUILT_IN_THEMES[0], paper: "A4", dateFormat: "DAY_MONTH_YEAR", language: "English", tone: "WARM", sections: DEFAULT_SECTION_LAYOUT, showPhoto: false, followThemeLayout: false, includeReferences: false, letterDate: "2026-11-15T00:00:00.000Z", company: "Ledgerly", location: "London", styles: {} });
}
