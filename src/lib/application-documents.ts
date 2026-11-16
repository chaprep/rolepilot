import "server-only";

// Loading an application with its tailored documents, for its page (E8)
// and for printing them (E8-8).

import { notFound } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";

import { DocumentKind } from "@/generated/prisma/enums";
import { extractedSchema, trimmedSchema, unitsSchema, type Trimmed, type Unit } from "@/lib/application-data";
import { skillLine, skillNamesIn } from "@/lib/skill-groups";
import { coverLetterLayoutSchema, sidebarLetterTheme, letterFormatting, type CoverLetterLayout } from "@/lib/cover-letter-format";
import { documentStateSchema, readDocumentState, type DocumentState } from "@/lib/document-state";
import { frozenProfile, readFrozenCopy } from "@/lib/frozen-copy";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { sectionLayoutSchema } from "@/lib/resume-sections";
import { loadSettings } from "@/lib/settings-data";
import { loadTheme, THEME_FIELDS } from "@/lib/theme-data";
import { BUILT_IN_THEMES, type ThemeData } from "@/lib/themes";

/**
 * The application for its page, with its documents and their themes, or the
 * not-found page when there's no such application. Cached per request, so the
 * page and its metadata share it.
 */
export const loadApplication = cache(async (id: string) => {
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      documents: { include: { theme: { select: THEME_FIELDS } } },
      messages: { orderBy: { createdAt: "asc" } },
      notes: true,
      events: { select: { id: true, to: true, at: true } },
      facts: { select: { id: true, text: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!application) notFound();
  return application;
});

/**
 * A JSON column read with its schema. Data that doesn't fit, such as rows
 * written by an older version, reads as null rather than breaking the page.
 */
export function readJson<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Today's date (or `date`'s) in the server's time zone, at UTC midnight, as documents expect. */
export function calendarDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** A tailored document's units and the theme it's shown in, with what was left out to fit its page limit. */
export type DocumentData = { units: Unit[]; theme: ThemeData; trimmed?: Trimmed; state?: DocumentState | null; initialLetterLayout?: CoverLetterLayout };

/**
 * An application's tailored documents with everything needed to draw them,
 * the same for the page and for printing (E8-8).
 */
export async function loadDocuments(id: string) {
  const [application, liveProfile, liveSettings] = await Promise.all([loadApplication(id), loadProfile(), loadSettings()]);
  const baseTheme = (await loadTheme(liveSettings.baseThemeId)) ?? BUILT_IN_THEMES[0];
  // Once it was sent, it's drawn from what it was sent with (#299).
  const copy = readFrozenCopy(application.frozen);
  const profile = copy ? frozenProfile(copy, liveProfile) : liveProfile;
  const settings = copy ? { ...liveSettings, paper: copy.paper, dateFormat: copy.dateFormat } : liveSettings;
  const documentData = (kind: DocumentKind): DocumentData | null => {
    const document = application.documents.find((entry) => entry.kind === kind);
    const units = document && readJson(unitsSchema, document.units);
    const trimmed = document && readJson(trimmedSchema, document.trimmed);
    const state = document ? readDocumentState(document.state) : null;
    const frozenTheme = kind === DocumentKind.EMAIL ? null : copy?.themes[kind];
    const initialLetterLayout = kind === DocumentKind.COVER_LETTER ? coverLetterLayoutSchema.parse(document?.initialLetterLayout ?? "CLASSIC") : undefined;
    const theme = frozenTheme ?? document?.theme ?? baseTheme;
    return document && units ? { units, state, initialLetterLayout, theme: state?.theme ?? (initialLetterLayout === "SIDEBAR" ? sidebarLetterTheme(theme) : theme), ...(trimmed?.length ? { trimmed } : {}) } : null;
  };
  const extracted = readJson(extractedSchema, application.extracted);
  const ownSections = readJson(sectionLayoutSchema, application.sections);
  const resumeState = readDocumentState(application.documents.find(row => row.kind === DocumentKind.RESUME)?.state);
  const sections = resumeState?.sections ?? ownSections ?? liveSettings.resumeSections;
  return {
    application,
    profile,
    /** The profile as it is now, whatever the application was sent with: what its Sections menu can add. */
    liveProfile,
    /** It was sent, so it's drawn from its copy. */
    sent: copy !== null,
    settings,
    extracted,
    resume: documentData(DocumentKind.RESUME),
    letter: documentData(DocumentKind.COVER_LETTER),
    /** The email's units, once it's been written (Email tab). */
    email: documentData(DocumentKind.EMAIL)?.units ?? null,
    /** Settings → "Include references", when the posting asks for them (SET-9). */
    includeReferences: resumeState?.includeReferences ?? ((copy ? copy.includeReferences : settings.includeRefs && extracted?.asksForReferences === true) || sections.withReferences === true),
    /** Its sections' order and which are off: its own, or the base resume's (#297). */
    sections,
    ownSections: resumeState !== null || ownSections !== null,
    /** Dated the day it was sent; until then, today. */
    letterDate: calendarDay(application.sentAt ?? undefined),
  };
}

/** Capture only document inputs, not private notes or mutable global defaults. */
export function snapshotDocumentState(loaded: Awaited<ReturnType<typeof loadDocuments>>, kind: DocumentKind): DocumentState {
  const document = kind === "RESUME" ? loaded.resume : kind === "COVER_LETTER" ? loaded.letter : null;
  if (document?.state) return { ...structuredClone(document.state), role: document.state.role || loaded.application.role };
  const profile = structuredClone(loaded.profile);
  profile.facts = [];
  if (kind === "RESUME" && document) {
    const skills = document.units.find(unit => unit.id === "skills")?.text ?? "";
    const listedSkills = skills.split("\n").flatMap(line => skillNamesIn(line).map((name, index) => ({ id: profile.skills.find(skill => skill.name.toLowerCase() === name.toLowerCase())?.id ?? `local-skill-${index}-${name.replace(/[^a-z0-9]/gi, "-")}`, name, group: skillLine(line).label ?? "" })));
    profile.skills = [...listedSkills, ...profile.skills.filter(skill => !listedSkills.some(listed => listed.id === skill.id))];
    for (const [key, prefix] of [["experience", "experience:"], ["projects", "project:"], ["education", "education:"], ["certifications", "certification:"], ["publications", "publication:"]] as const) {
      const positions = new Map(document.units.map((unit, index) => [unit.id, index]));
      profile[key].sort((a, b) => (positions.get(`${prefix}${a.id}`) ?? 1000) - (positions.get(`${prefix}${b.id}`) ?? 1000));
    }
  }

  if (kind !== "RESUME") {
    for (const key of ["experience", "projects", "education", "certifications", "publications", "references", "skills", "languages", "customSections"] as const) profile[key] = [];
    profile.photo = null;
  }
  const { application, settings } = loaded;
  return documentStateSchema.parse({ version: 1, role: application.role, coverLetterLayout: kind === "COVER_LETTER" ? document?.initialLetterLayout ?? "CLASSIC" : "CLASSIC", profile, theme: document?.theme ?? loaded.resume?.theme ?? loaded.letter?.theme ?? BUILT_IN_THEMES[0], paper: settings.paper, dateFormat: settings.dateFormat, language: application.language, tone: application.tone, sections: loaded.sections, showPhoto: application.showPhoto, followThemeLayout: application.followThemeLayout, includeReferences: loaded.includeReferences, letterDate: loaded.letterDate.toISOString(), company: application.company, location: application.location, styles: kind === "COVER_LETTER" ? letterFormatting(document?.initialLetterLayout ?? "CLASSIC") ?? {} : {} });
}
