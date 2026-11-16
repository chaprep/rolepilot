import { z } from "zod";

import { CustomSectionFormat, DateFormat, DateStyle, Density, DocumentKind, HeaderStyle, HeadingStyle, LanguageLevel, PaperSize, PhotoPosition, PhotoShape, SidebarStyle, ThemeAlign, ThemeFont, ThemeLayout, Tone } from "@/generated/prisma/enums";
import { BASICS_FIELDS, languageLevelLabel, type Basics, type ProfileData } from "@/lib/profile";
import { coverLetterLayoutSchema, letterFormatting, sidebarLetterTheme, sidebarLetterUnits } from "@/lib/cover-letter-format";
import { defaultFrame, withFrame } from "@/lib/letter-frame";
import { documentLabels } from "@/lib/document-labels";
import { isPhotoDataUrl } from "@/lib/photo";
import { sectionLayoutSchema, customKey } from "@/lib/resume-sections";
import { skillsText, skillNamesIn } from "@/lib/skill-groups";
import { unitSchema, type Unit } from "@/lib/application-data";
import { PAPER_SIZES, documentFamily, BUILT_IN_THEMES, type ThemeData } from "@/lib/themes";
const text = z.string().default("");
const list = <T extends z.ZodType>(item: T) => z.array(item).default([]);
const when = { startYear: z.number().nullable().default(null), startMonth: z.number().nullable().default(null), endYear: z.number().nullable().default(null), endMonth: z.number().nullable().default(null), current: z.boolean().default(false) };

/**
 * The profile as a copy holds it. Every field has a default, so a copy made
 * by an older version keeps reading when the profile gains a field: add new
 * fields here, with one. `satisfies` below fails the build otherwise.
 */
export const documentProfileSchema = z.object({
  basics: z.record(z.string(), z.unknown()).transform((raw): Basics => ({
    ...(Object.fromEntries(BASICS_FIELDS.map((field) => [field, typeof raw[field] === "string" ? raw[field] : ""])) as Record<(typeof BASICS_FIELDS)[number], string>),
    showAge: raw.showAge === true,
  })),
  skills: list(z.object({ id: z.string(), name: text, group: text })),
  languages: list(z.object({ id: z.string(), name: text, level: z.enum(LanguageLevel) })),
  experience: list(z.object({ id: z.string(), role: text, company: text, location: text, descriptor: text, volunteering: z.boolean().default(false), bullets: text, skillIds: z.array(z.string()).default([]), ...when })),
  projects: list(z.object({ id: z.string(), name: text, link: text, bullets: text, skillIds: z.array(z.string()).default([]), ...when })),
  education: list(z.object({ id: z.string(), degree: text, school: text, notes: text, ...when })),
  certifications: list(
    z.object({
      id: z.string(),
      name: text,
      issuer: text,
      year: z.number().nullable().default(null),
      month: z.number().nullable().default(null),
      expiryYear: z.number().nullable().default(null),
      expiryMonth: z.number().nullable().default(null),
      credentialId: text,
      link: text,
      onResumes: z.boolean().default(true),
    }),
  ),
  publications: list(z.object({ id: z.string(), citation: text, link: text, onResumes: z.boolean().default(true) })),
  references: list(z.object({ id: z.string(), name: text, relation: text, company: text, email: text, phone: text })),
  customSections: list(
    z.object({
      id: z.string(),
      title: text,
      format: z.enum(CustomSectionFormat),
      items: list(z.object({ id: z.string(), title: text, subtitle: text, details: text, link: text, onResumes: z.boolean().default(true), ...when })),
    }),
  ),
  facts: list(z.object({ id: z.string(), text })),
}) satisfies z.ZodType<Omit<ProfileData, "photo">, unknown>;

const color = z.string().regex(/^#[\da-f]{6}$/i);
const finite = z.number().finite();
export const documentThemeSchema = z.object({
  id: z.string(), name: z.string(), builtIn: z.boolean(), headFont: z.enum(ThemeFont), bodyFont: z.enum(ThemeFont),
  accent: color, layout: z.enum(ThemeLayout), align: z.enum(ThemeAlign), headingStyle: z.enum(HeadingStyle), density: z.enum(Density),
  marginXmm: finite.min(0).nullable().optional(), marginYmm: finite.min(0).nullable().optional(),
  headerStyle: z.enum(HeaderStyle), sidebarStyle: z.enum(SidebarStyle), dateStyle: z.enum(DateStyle), photoShape: z.enum(PhotoShape), photoPosition: z.enum(PhotoPosition),
});

/** Point sizes and millimetre gaps, independent of preview scaling. */
export const documentStyleSchema = z.object({
  font: z.enum(ThemeFont).optional(), fontSize: finite.positive().max(200).optional(),
  fontWeight: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  hidden: z.boolean().optional(), bodyFormat: z.enum(["bullets", "paragraphs"]).optional(), bulletStyle: z.enum(["disc", "circle", "square", "decimal", "none"]).optional(),
  italic: z.boolean().optional(), underline: z.boolean().optional(), color: color.optional(), backgroundColor: color.optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(), lineHeight: finite.positive().max(5).optional(),
  paragraphGapMm: finite.min(0).max(100).optional(), sectionGapMm: finite.min(0).max(100).optional(), itemGapMm: finite.min(0).max(100).optional(),
});
export type DocumentStyle = z.infer<typeof documentStyleSchema>;
export const documentStateSchema = z.object({
  version: z.literal(1), coverLetterLayout: coverLetterLayoutSchema.default("CLASSIC"), role: z.string().default(""), profile: documentProfileSchema.extend({ photo: z.object({ src: z.string().refine(isPhotoDataUrl), onResumes: z.boolean() }).nullable() }),
  theme: documentThemeSchema, paper: z.enum(PaperSize), dateFormat: z.enum(DateFormat), language: z.string(), tone: z.enum(Tone),
  sections: sectionLayoutSchema, showPhoto: z.boolean().nullable(), followThemeLayout: z.boolean(), includeReferences: z.boolean(),
  dateLabels: z.record(z.string().regex(/^[\w:.-]+$/), z.string().max(200)).default({}),
  letterDate: z.string().datetime(), company: z.string(), location: z.string(),
  styles: z.record(z.string().regex(/^(document|header|headings|name|headline|section:[\w:.-]+|unit:[\w:.-]+)$/), documentStyleSchema),
}).superRefine((state, ctx) => {
  const paper = PAPER_SIZES[state.paper];
  if ((state.theme.marginXmm ?? 0) * 2 >= paper.widthMm || (state.theme.marginYmm ?? 0) * 2 >= paper.heightMm) ctx.addIssue({ code: "custom", message: "Margins must leave room for content." });
});
export type DocumentState = z.infer<typeof documentStateSchema>;
export type DocumentStates = Partial<Record<DocumentKind, DocumentState | null>>;
export function readDocumentState(value: unknown): DocumentState | null {
  // Null is legacy inheritance; malformed saved state must not silently discard local edits.
  return value == null ? null : documentStateSchema.parse(value);
}

const kind = z.enum(DocumentKind);
const id = z.string().min(1).max(160).regex(/^[\w:.-]+$/);
export const documentOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings"), document: kind, json: z.string() }),
  z.object({ type: z.literal("style"), document: kind, target: z.string(), json: z.string() }),
  z.object({ type: z.literal("metadata"), document: kind, path: z.string(), json: z.string() }),
  z.object({ type: z.literal("entry"), document: kind, collection: z.enum(["experience", "projects", "education", "certifications", "publications", "references", "skills", "languages", "customSections"]), action: z.enum(["upsert", "remove", "move"]), id, json: z.string(), beforeId: id.nullable() }),
  z.object({ type: z.literal("unit"), document: kind, action: z.enum(["upsert", "remove", "move"]), id, label: z.string(), text: z.string(), beforeId: id.nullable() }),
]);
export type DocumentOperation = z.infer<typeof documentOperationSchema>;
export const documentChangeSchema = z.object({
  document: kind, beforeUnits: z.array(unitSchema), afterUnits: z.array(unitSchema),
  beforeState: documentStateSchema.nullable(), afterState: documentStateSchema.nullable(),
});
export const documentChangesSchema = z.array(documentChangeSchema);
export type DocumentChange = z.infer<typeof documentChangeSchema>;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const collections = new Set(["experience", "projects", "education", "certifications", "publications", "references", "skills", "languages", "customSections"]);
function object(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => forbidden.has(key))) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function move<T extends { id: string }>(items: T[], entry: T, beforeId: string | null) {
  const previous = items.findIndex(item => item.id === entry.id);
  if (previous >= 0) items.splice(previous, 1);
  const index = beforeId === null ? items.length : items.findIndex(item => item.id === beforeId);
  if (index < 0) throw new Error("The insertion target no longer exists.");
  items.splice(index, 0, entry);
}
function withFrameForLayout(state: DocumentState, units: Unit[]): Unit[] {
  return withFrame(units, defaultFrame({ basics: state.profile.basics, company: state.company, location: state.location, date: new Date(state.letterDate), dateFormat: state.dateFormat, labels: documentLabels(state.language) }));
}

/** Applies a validated operation to a detached working copy; the caller commits all copies together. */
export function applyDocumentOperation(state: DocumentState, units: Unit[], operation: DocumentOperation, themes: readonly ThemeData[] = BUILT_IN_THEMES): DocumentState {
  const listedSkillNames = skillNamesIn(units.find(unit => unit.id === "skills")?.text ?? "");
  const skillIds = new Set(state.profile.skills.filter(skill => listedSkillNames.includes(skill.name)).map(skill => skill.id));
  const languageText = units.find(unit => unit.id === "languages")?.text.toLowerCase() ?? "";
  const languageIds = new Set(state.profile.languages.filter(language => languageText.includes(language.name.toLowerCase())).map(language => language.id));
  if (operation.document === "EMAIL" && operation.type !== "unit" && !(operation.type === "settings" && Object.keys(object(operation.json)).every(key => key === "language"))) throw new Error("Email supports plain-text edits only.");
  if (operation.type === "settings") {
    const patch = object(operation.json);
    const allowed = ["coverLetterLayout", "themeId", "theme", "paper", "dateFormat", "language", "tone", "sections", "showPhoto", "followThemeLayout", "includeReferences", "letterDate", "dateLabels", "company", "location"];
    if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error("Unknown document setting.");
    if (patch.coverLetterLayout !== undefined) {
      if (operation.document !== "COVER_LETTER") throw new Error("Letter format only applies to cover letters.");
      const layout = coverLetterLayoutSchema.parse(patch.coverLetterLayout);
      if (layout === "SIDEBAR" && state.coverLetterLayout !== "SIDEBAR") {
        const parts = sidebarLetterUnits(withFrameForLayout(state, units), state.role || state.profile.basics.headline);
        units.splice(0, units.length, ...parts);
        state.theme = sidebarLetterTheme(state.theme);
        if (state.styles["unit:sender"] && !state.styles["unit:contacts"]) state.styles["unit:contacts"] = { ...state.styles["unit:sender"] };
        state.styles = letterFormatting(layout, state.styles)!;
      }
    }
    if (patch.themeId !== undefined) {
      const theme = themes.find(theme => theme.id === patch.themeId);
      if (!theme) throw new Error("That theme is unavailable.");
      state.theme = structuredClone(theme);
      state.styles = {};
      state.followThemeLayout = true;
      delete patch.themeId;
    }
    Object.assign(state, { ...patch, ...(patch.dateLabels ? { dateLabels: { ...state.dateLabels, ...z.record(z.string(), z.string()).parse(patch.dateLabels) } } : {}), ...(patch.theme ? { theme: { ...state.theme, ...documentThemeSchema.partial().strict().parse(patch.theme) } } : {}) });
    if (operation.document === "COVER_LETTER") {
      if (Object.keys(patch).some(key => ["dateLabels", "sections", "showPhoto", "followThemeLayout", "includeReferences"].includes(key))) throw new Error("That setting belongs to a resume, not a letter.");
      const resumeOnly = ["layout", "sidebarStyle", "dateStyle", "photoShape", "photoPosition"];
      if (patch.theme && Object.keys(patch.theme as object).some(key => resumeOnly.includes(key))) throw new Error("Use coverLetterLayout for letter formats; resume theme layouts do not apply.");
      const frame = defaultFrame({ basics: state.profile.basics, company: state.company, location: state.location, date: new Date(state.letterDate), dateFormat: state.dateFormat, labels: documentLabels(state.language) });
      for (const field of ["date", "recipient"] as const) {
        const changed = field === "date" ? "letterDate" in patch || "dateFormat" in patch : "company" in patch || "location" in patch;
        if (changed) {
          const unit = units.find(unit => unit.id === field);
          if (unit) unit.text = frame[field];
        }
      }
    }

  } else if (operation.type === "style") {
    const target = operation.target;
    if (operation.document === "COVER_LETTER" && (target.startsWith("section:") || target === "headings")) throw new Error("For a letter, style its document, header, name, headline or text units.");
    const knownSections = ["contact", ...state.sections.order, ...state.profile.customSections.map(section => customKey(section.id))];
    if (!["document", "header", "headings", "name", "headline"].includes(target) && !(target.startsWith("section:") && knownSections.includes(target.slice(8))) && !(target.startsWith("unit:") && (units.some(unit => unit.id === target.slice(5)) || state.profile.references.some(entry => `reference:${entry.id}` === target.slice(5))))) throw new Error("Unknown style target.");
    state.styles[target] = { ...state.styles[target], ...documentStyleSchema.strict().parse(object(operation.json)) };
  } else if (operation.type === "metadata") {
    const parts = operation.path.split(".");
    if (parts.some(part => forbidden.has(part))) throw new Error("Invalid field path.");
    const value: unknown = JSON.parse(operation.json);
    if (parts[0] === "basics" && parts.length === 2 && [...BASICS_FIELDS, "showAge"].includes(parts[1] as typeof BASICS_FIELDS[number])) {
      if (parts[1] === "showAge" ? typeof value !== "boolean" : typeof value !== "string") throw new Error("Invalid basic field value.");
      const previous = state.profile.basics[parts[1] as keyof Basics];
      Object.assign(state.profile.basics, { [parts[1]]: value });
      if (parts[1] === "summary") {
        const unit = units.find(unit => unit.id === "summary");
        if (unit) unit.text = value as string;
      }
      if (operation.document === "COVER_LETTER" && typeof value === "string") {
        if (parts[1] === "headline") { const unit = units.find(unit => unit.id === "headline"); if (unit) unit.text = value; }
        const sender = units.find(unit => unit.id === "sender");
        const contactUnit = units.find(unit => unit.id === "contacts") ?? sender;
        if (sender) {
          if (parts[1] === "name") sender.text = [value, ...sender.text.split("\n").slice(1)].join("\n");
          else if (typeof previous === "string" && previous && contactUnit?.text.includes(previous)) contactUnit.text = contactUnit.text.replace(previous, value);
          else if (["email", "phone", "address", "website", "linkedin"].includes(parts[1]) && value && contactUnit) contactUnit.text += `\n${value}`;
        }
        if (parts[1] === "name") {
          const signature = units.find(unit => unit.id === "signature");
          if (signature) signature.text = value;
        }
      }
    } else if (collections.has(parts[0]) && parts.length === 3) {
      const entries = state.profile[parts[0] as "experience"] as unknown as Record<string, unknown>[];
      const entry = entries.find(entry => entry.id === parts[1]);
      if (!entry || !(parts[2] in entry) || parts[2] === "id") throw new Error("Unknown entry field.");
      entry[parts[2]] = value;
      const textFields: Record<string, [string, string]> = { experience: ["bullets", "experience:"], projects: ["bullets", "project:"], education: ["notes", "education:"], certifications: ["name", "certification:"], publications: ["citation", "publication:"] };
      const mapping = textFields[parts[0]];
      if (mapping && parts[2] === mapping[0] && typeof value === "string") {
        const unit = units.find(unit => unit.id === `${mapping[1]}${parts[1]}`);
        if (unit) unit.text = value;
      }
    } else throw new Error("Unknown document field.");
  } else if (operation.type === "entry") {
    const entries = state.profile[operation.collection] as unknown as { id: string }[];
    const index = entries.findIndex(entry => entry.id === operation.id);
    if (operation.action === "remove") {
      if (index < 0) throw new Error("The entry no longer exists.");
      entries.splice(index, 1);
    } else if (operation.action === "move") {
      if (index < 0) throw new Error("The entry no longer exists.");
      move(entries, entries[index], operation.beforeId);
    } else {
      if (index < 0 && !operation.id.startsWith("local-")) throw new Error("New entries must use a local- id.");
      const entry = { ...object(operation.json), id: operation.id };
      if (index >= 0 && operation.beforeId === null) entries[index] = entry;
      else move(entries, entry, operation.beforeId);
    }
    if (operation.collection === "customSections" && operation.action === "upsert" && !state.sections.order.includes(customKey(operation.id))) state.sections.order.push(customKey(operation.id));
  } else {
    const index = units.findIndex(unit => unit.id === operation.id);
    if (operation.document === "EMAIL" && (!["to", "subject", "body"].includes(operation.id) || operation.action === "move")) throw new Error("Unknown email field.");
    if (operation.action === "remove") {
      if (index < 0) throw new Error("The text unit no longer exists.");
      units.splice(index, 1);
    } else if (operation.action === "move") {
      if (index < 0) throw new Error("The text unit no longer exists.");
      move(units, units[index], operation.beforeId);
    } else {
      const unit = unitSchema.parse({ id: operation.id, label: operation.label, text: operation.text });
      if (index >= 0 && operation.beforeId === null) units[index] = unit;
      else move(units, unit, operation.beforeId);
    }
  }
  if (operation.type === "entry" && ["skills", "languages"].includes(operation.collection) || operation.type === "metadata" && ["skills", "languages"].includes(operation.path.split(".")[0])) {
    state = documentStateSchema.parse(state);
    const collection = operation.type === "entry" ? operation.collection : operation.path.split(".")[0];
        if (operation.type === "entry" && operation.action === "upsert") (collection === "skills" ? skillIds : languageIds).add(operation.id);
    const text = collection === "skills" ? skillsText(state.profile.skills.filter(skill => skillIds.has(skill.id))) : state.profile.languages.filter(language => languageIds.has(language.id)).map(item => `${item.name}: ${languageLevelLabel(item.level)}`).join(" · ");
    const unit = units.find(unit => unit.id === collection);
    if (unit) unit.text = text;
    else units.push({ id: collection, label: collection === "skills" ? "Skills" : "Languages", text });
  }
  if (units.length > 300 || new Set(units.map(unit => unit.id)).size !== units.length) throw new Error("Invalid text units.");
  return documentStateSchema.parse(state);
}

/** Only displayed fields requested by the model are revealed in a second refinement pass. */
export const privateFieldSchema = z.object({ document: kind, field: z.enum(["name", "email", "phone", "address", "dob", "website", "linkedin", "sender", "contacts", "signature", "references"]) });
export type PrivateField = z.infer<typeof privateFieldSchema>;
export function stateForPrompt(state: DocumentState): unknown {
  const copy = structuredClone(state);
  for (const key of ["name", "email", "phone", "address", "dob", "website", "linkedin"] as const) copy.profile.basics[key] = "[private; request this field only for an explicit edit]";
  copy.profile.photo = null;
  copy.profile.references = [];
  copy.profile.facts = [];
  return copy;
}

export const DOCUMENT_OPERATIONS = `You can edit complete application documents using operations (or existing text edits). Operations apply in order, atomically. Each operation has a document: RESUME, COVER_LETTER or EMAIL.
- settings: json is a JSON object with any of coverLetterLayout (CLASSIC/SIDEBAR, letters only), themeId (select from available themes and reset appearance), theme (partial current theme fields), paper, dateFormat (letter date), dateLabels (resume unit-id to exact displayed date string, empty hides it), language, tone, sections (complete order/off/side/titles/withReferences), showPhoto, followThemeLayout, includeReferences, letterDate (ISO), company, location. Layout options and fonts use the current enum identifiers; fonts may only use the supplied registered font list. Setting theme.layout requires followThemeLayout:true. Never change a shared theme. Cover letters support their own CLASSIC or SIDEBAR format via coverLetterLayout: do not set resume-only layout, sidebarStyle, dateStyle or photo fields in a letter theme patch. Theme selection still applies its fonts/colors/header style.
- style: target is document (body text), header, headings, name, headline, section:<section key> (including contact for sidebar contacts) or unit:<unit id>; json is a partial style: font (registered enum), fontSize (points), fontWeight (300/400/500/600/700/800), hidden (hide/show a block), bodyFormat (bullets/paragraphs), bulletStyle (disc/circle/square/decimal/none), italic, underline, color/backgroundColor (#rrggbb), align (left/center/right/justify), lineHeight (ratio), paragraphGapMm/sectionGapMm/itemGapMm (millimetres). Targeted styles override inherited ones.
- metadata: path is basics.<field> or <collection>.<entry id>.<field>; json is the new value encoded as JSON. This edits displayed names, titles, dates and links independently of the global profile. To change a text unit use edits instead.
- entry: collection is experience/projects/education/certifications/publications/references/skills/languages/customSections; action upsert/remove/move; id is stable, json is the complete entry JSON for upsert (match existing entry shapes), beforeId is null for append/retain position or another entry id. For additions provide both the profile entry AND its unit text, where the existing renderer uses units. Custom sections support ENTRIES, LINES and INLINE, with complete items. New entry ids must use local- prefix. Removing an entry also requires removing its text unit, if any. Reorder resume entries in their profile collections, letter paragraphs in units.
- unit: action upsert/remove/move; id, label, text, beforeId. Use this to add/delete/reorder cover-letter paragraphs or add/remove resume text units. For a resume a new unit needs matching entry metadata or a built-in summary/skills/languages id. To remove a whole resume section turn it off in sections; to rename/reorder/place it use sections titles/order/side.
Resume/letter inline text supports **bold**, *italic*, __underline__, ==highlight== and [text](https://url). Never emit raw HTML/CSS. Letter sender/headline/contacts units hold the name, role title and contact block separately in Sidebar format; a legacy sender can still contain combined contacts. Edit or request the contacts unit for Sidebar contact changes. The email is plain text: only edits/unit operations on to,subject,body, or settings.language; no font or layout changes.
Set privateEditsRequested:true only when the user explicitly requests changes to their displayed name, contact details, header content, references or signature; otherwise false. Styling alone never needs private values.
If an explicit header/contact/signature request needs hidden values, return requestedFields [{document,field}] and no edits/operations. You will receive only those fields and must then return the final changes. Do not request private fields for ordinary content or style edits. Never expose photo data or private notes. Return operations:[] and requestedFields:[] when not needed. Do not claim success for unsupported operations.`;

/** Validate references after all operations, allowing an entry and its unit to be added in either order. */
export function validateDocumentUnits(state: DocumentState, units: Unit[], kind: DocumentKind) {
  const ids = new Set([
    "summary", "skills", "languages",
    ...state.profile.experience.map(entry => `experience:${entry.id}`),
    ...state.profile.projects.map(entry => `project:${entry.id}`),
    ...state.profile.education.map(entry => `education:${entry.id}`),
    ...state.profile.certifications.map(entry => `certification:${entry.id}`),
    ...state.profile.publications.map(entry => `publication:${entry.id}`),
    ...state.profile.customSections.flatMap(section => section.format === "INLINE" ? [`custom-inline:${section.id}`] : section.items.map(entry => `${section.format === "ENTRIES" ? "custom-entry" : "custom-line"}:${entry.id}`)),
  ]);
  if (kind === "RESUME" && Object.keys(state.dateLabels).some(key => !ids.has(key))) throw new Error("A date label has no matching resume entry.");
  if (kind === "RESUME" && units.some(unit => !ids.has(unit.id))) throw new Error("A resume text unit has no matching entry. Add its entry metadata too.");
  if (kind === "COVER_LETTER" && units.some(unit => !["sender", "headline", "contacts", "date", "recipient", "greeting", "signature", "sign-off"].includes(unit.id) && !unit.id.startsWith("paragraph:"))) throw new Error("Unknown cover-letter unit.");
}

/** CSS is generated only from validated tokens/numbers, never model-authored selectors or CSS. */
export function documentStyleRules(document: "resume" | "letter", styles: Record<string, DocumentStyle>, paper: PaperSize): string {
  const root = `[data-document="${document}"]`;
  const unitsPerMm = 640 / PAPER_SIZES[paper].widthMm;
  const scaledMm = (value: number) => `calc(var(--u) * ${value * unitsPerMm})`;
  const rules: string[] = Object.values(styles).some(style => style.sectionGapMm !== undefined) ? [`${root} [data-column]{gap:0}`, `${root} [data-column]>*+*{margin-top:calc(var(--u)*var(--gap))}`] : [];
  const priority = (target: string) => target === "document" ? 0 : target === "header" ? 1 : target.startsWith("section:") ? 2 : target === "headings" ? 3 : target.startsWith("unit:") ? 4 : 5;
  for (const [target, raw] of Object.entries(styles).sort(([a], [b]) => priority(a) - priority(b))) {
    const style = documentStyleSchema.parse(raw);
    const attribute = (key: string, value: string) => `[${key}=${JSON.stringify(value)}]`;
    const selector = target === "document" ? root : target === "header" ? `${root} :is([data-document-header],[data-unit="sender"])` : target === "headings" ? `${root} h2` : target === "name" ? `${root} :is(h1,[data-document-name])` : target === "headline" ? `${root} :is([data-headline],[data-unit="headline"])` : target.startsWith("section:") ? `${root} ${attribute("data-section", target.slice(8))}` : `${root} ${attribute("data-unit", target.slice(5))}`;
    const declarations: string[] = [];
    if (style.hidden !== undefined) rules.push(`${selector}{display:${style.hidden ? "none" : "revert"}!important}`);
    if (style.bulletStyle) rules.push(`${selector} ul{list-style-type:${style.bulletStyle}!important}`);
    if (style.font) declarations.push(`font-family:${documentFamily(style.font)}`);
    if (style.fontSize !== undefined) declarations.push(`font-size:calc(var(--u) * ${style.fontSize * unitsPerMm * 25.4 / 72})`);
    if (style.fontWeight !== undefined) declarations.push(`font-weight:${style.fontWeight}`);
    if (style.italic !== undefined) declarations.push(`font-style:${style.italic ? "italic" : "normal"}`);
    if (style.underline !== undefined) declarations.push(`text-decoration:${style.underline ? "underline" : "none"}`);
    if (style.color) declarations.push(`color:${style.color}`);
    if (style.backgroundColor) declarations.push(`background-color:${style.backgroundColor}`);
    if (style.align) declarations.push(`text-align:${style.align}`);
    if (style.lineHeight !== undefined) declarations.push(`line-height:${style.lineHeight}`);
    const explicit = declarations.map(value => `${value}!important`).join(";");
    if (explicit) rules.push(`${selector}{${explicit}}`, `${selector} :where(p,li,a,${target === "header" ? "h1,h2," : ""}[data-unit]){${declarations.filter(value => !value.startsWith("background-color:")).map(value => `${value}!important`).join(";")}}`);
    if (style.sectionGapMm !== undefined && target.startsWith("section:")) rules.push(`${selector}{margin-top:${scaledMm(style.sectionGapMm)}!important}`);
    if (style.sectionGapMm !== undefined) rules.push(`${selector}{--gap:${style.sectionGapMm * unitsPerMm}}`, `${selector} [data-section]+[data-section]{margin-top:${scaledMm(style.sectionGapMm)}!important}`);
    if (style.itemGapMm !== undefined) rules.push(`${selector}{--item-gap:${style.itemGapMm * unitsPerMm}}`, `${selector} [data-unit]+[data-unit]{margin-top:${scaledMm(style.itemGapMm)}!important}`);
    if (style.paragraphGapMm !== undefined) rules.push(`${selector} p+ p,${selector} [data-unit]+[data-unit]{margin-top:${scaledMm(style.paragraphGapMm)}!important}`, `${selector} [data-paragraphs]{gap:${scaledMm(style.paragraphGapMm)}!important}`);
  }
  return rules.join("\n");
}
