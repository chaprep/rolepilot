import { z } from "zod";
import type { Unit } from "@/lib/application-data";
import type { DocumentStyle } from "@/lib/document-state";
import type { ThemeData } from "@/lib/themes";
import { withFrame } from "@/lib/letter-frame";

export const coverLetterLayoutSchema = z.enum(["CLASSIC", "SIDEBAR"]);
export type CoverLetterLayout = z.infer<typeof coverLetterLayoutSchema>;
export const LETTER_NAVY = "#243B53";

/** The template is local to letters: no shared Theme row is changed. */
export function sidebarLetterTheme(theme: ThemeData): ThemeData {
  return { ...theme, headFont: "INTER", bodyFont: "INTER", accent: LETTER_NAVY, headerStyle: "PLAIN", align: "LEFT" };
}

const sidebarDefaults: Record<string, DocumentStyle> = {
  document: { fontSize: 10.5, lineHeight: 1.35 },
  name: { fontSize: 24, fontWeight: 700, lineHeight: 1.1875 },
  "unit:headline": { fontSize: 16, fontWeight: 600 },
  "unit:contacts": { fontSize: 10, lineHeight: 1.4 },
};
export function letterFormatting(layout: CoverLetterLayout, overrides?: Record<string, DocumentStyle>): Record<string, DocumentStyle> | undefined {
  if (layout === "CLASSIC") return overrides;
  const styles = structuredClone(sidebarDefaults);
  for (const [key, value] of Object.entries(overrides ?? {})) styles[key] = { ...styles[key], ...value };
  return styles;
}

/** Convert only on creation or explicit selection. Existing separated contact text takes precedence. */
export function sidebarLetterUnits(units: Unit[], headline: string): Unit[] {
  const copy = structuredClone(units);
  const sender = copy.find(unit => unit.id === "sender");
  const [name = "", ...contacts] = (sender?.text ?? "").split("\n");
  if (sender) sender.text = name;
  return withFrame(copy, { headline, contacts: contacts.join("\n") });
}
