import { z } from "zod";
import type { ProfileData } from "@/lib/profile";

import { DocumentKind } from "@/generated/prisma/enums";

// Schemas for the JSON columns of Application, Document and ChatMessage
// (prisma/schema.prisma). The AI tasks (src/lib/ai/tasks) produce these
// shapes. Parse a column with `schema.parse(row.column)` when reading it.

/**
 * A part of a tailored document that can be edited, regenerated or refined
 * on its own (APP-4). Ids are stable: "summary", "skills", "languages",
 * "experience:<experience id>", "education:<education id>" in a resume, and
 * "paragraph:1", "paragraph:2"… and "sign-off" in a cover letter.
 */
export const unitSchema = z.object({
  id: z.string().min(1),
  /** Shown on the unit's toolbar and the chat target, e.g. "Summary" or "Northwind Logistics role". */
  label: z.string(),
  text: z.string(),
  /**
   * Names, numbers or credentials the fact guard (E6-6) couldn't find in the
   * profile or the posting, shown as "check this" (E8-3). Absent when fine.
   */
  unverified: z.array(z.string()).optional(),
});
export type Unit = z.infer<typeof unitSchema>;

/** The cover letter's closing line ("Warm regards,"), kept as a unit so it can be edited. */
export const SIGN_OFF_UNIT = "sign-off";

/** Document.units: the document's units in reading order. */
export const unitsSchema = z
  .array(unitSchema)
  .refine((units) => new Set(units.map((unit) => unit.id)).size === units.length, {
    error: "Unit ids must be unique.",
  });

/**
 * One thing the posting asks for, typed so matching can be checked in code
 * (E6-5): a skill, an amount of experience, a spoken language or anything else.
 */
export const requirementSchema = z.object({
  /** In the posting's words, shortened, e.g. "5+ years of product design". */
  text: z.string(),
  kind: z.enum(["skill", "years", "language", "other"]),
  /** For a skill: its short name, e.g. "Figma". */
  skill: z.string().nullable(),
  /** For an amount of experience: the years asked for. */
  years: z.number().nullable(),
  /** For a spoken language: its English name, e.g. "Dutch". */
  language: z.string().nullable(),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** Application.extracted: what the AI read from the posting (NEW-3). Missing fields are null. */
export const extractedSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  mode: z.string().nullable(),
  salary: z.string().nullable(),
  /** "2026-10-15" */
  deadline: z.iso.date().nullable(),
  requirements: z.array(requirementSchema),
  /** Whether the posting asks for references (SET-9: include them only then). */
  asksForReferences: z.boolean(),
  /** Legacy posting-language metadata; new extraction leaves it null. */
  language: z.string().nullable(),
});
export type Extracted = z.infer<typeof extractedSchema>;

/**
 * What was read from an application's posting, for a prompt. Rows from
 * before the current schema fall back to the application's own details.
 */
export function extractedOf(application: {
  extracted: unknown;
  title: string;
  company: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  language: string;
}): Extracted {
  const parsed = extractedSchema.safeParse(application.extracted);
  if (parsed.success) return parsed.data;
  const orNull = (value: string) => value.trim() || null;
  return {
    title: orNull(application.title),
    company: orNull(application.company),
    role: orNull(application.role),
    location: orNull(application.location),
    mode: orNull(application.mode),
    salary: orNull(application.salary),
    deadline: null,
    requirements: [],
    asksForReferences: false,
    language: orNull(application.language),
  };
}

/**
 * How a requirement matches the profile (NEW-4): covered (the skill is used in
 * a role), partial (the skill is in the profile but not attached to a role)
 * or gap (not in the profile).
 */
export const matchResults = ["covered", "partial", "gap"] as const;
export type MatchResult = (typeof matchResults)[number];

export const matchItemSchema = z.object({
  evidenceIds: z.array(z.string()).optional(),
  evidenceOrigin: z.enum(["profile", "memory"]).optional(),
  requirement: z.string(),
  result: z.enum(matchResults),
  /** The profile skill or language the requirement maps to, if any. */
  skill: z.string().nullable(),
  /** The roles where that skill was used. */
  experienceIds: z.array(z.string()),
  /** A short explanation, e.g. "Nothing in your profile for this yet". Older matches may promise the letter addresses it. */
  note: z.string().nullable(),
});

/** Application.match */
export const matchSchema = z.object({ items: z.array(matchItemSchema) });
export type Match = z.infer<typeof matchSchema>;

/** A gap after its skill was added to the profile (NEW-5): in the profile, not yet used in a role. */
export function withSkillAdded(item: Match["items"][number], skill: string): Match["items"][number] {
  return { ...item, result: "partial", skill, note: "In your skills, but not linked to a role yet" };
}

/** "5/7 match": requirements that are covered or partly covered, out of all of them. */
export function matchScore(match: Match): { hit: number; total: number } {
  return {
    hit: match.items.filter((item) => item.result !== "gap").length,
    total: match.items.length,
  };
}

/** One unit change made from the chat, with the text it replaced so it can be undone (APP-8). */
export const unitEditSchema = z.object({
  document: z.enum(DocumentKind),
  unitId: z.string().min(1),
  text: z.string(),
  previousText: z.string(),
  /** What the fact guard couldn't back in the new text (E6-6). */
  unverified: z.array(z.string()).optional(),
  /** The fact guard's hints on the text it replaced, which Undo brings back. */
  previousUnverified: z.array(z.string()).optional(),
});

/**
 * Document.trimmed (E10-10): what was left out of a tailored resume to fit
 * its page limit, or by hand with "Leave out" (#217), so it can be put back.
 * A whole part goes back where it was; bullets go back at the end of their role.
 */
export const trimmedSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("unit"),
      unit: unitSchema,
      index: z.number().int().min(0),
      /** Left out with "Leave out", not to fit the page limit. */
      byHand: z.literal(true).optional(),
    }),
    z.object({ kind: z.literal("bullets"), unitId: z.string().min(1), label: z.string(), lines: z.array(z.string()).min(1) }),
  ]),
);
export type Trimmed = z.infer<typeof trimmedSchema>;

/** ChatMessage.edits */
export const editsSchema = z.array(unitEditSchema);
export type UnitEdit = z.infer<typeof unitEditSchema>;

/** User-supplied evidence scoped to one JD; the id makes submissions retryable. */
export const applicationEvidenceSchema = z.object({
  id: z.uuid(),
  requirementIndex: z.number().int().min(0),
  text: z.string().trim().min(1, "Describe your supporting experience.").max(800),
  targetUnitId: z.string().nullable(),
});
export type ApplicationEvidence = z.infer<typeof applicationEvidenceSchema>;
export type EvidenceOption = { id: string; label: string };

export function evidenceOptions(profile: ProfileData): EvidenceOption[] {
  return [
    ...profile.experience.map((entry) => ({ id: `experience:${entry.id}`, label: `${entry.role} at ${entry.company}` })),
    ...profile.projects.map((entry) => ({ id: `project:${entry.id}`, label: entry.name })),
  ];
}

/** Human-readable facts remain compatible with the existing editor and backups. */
export function applicationEvidenceText(skill: string, evidence: ApplicationEvidence, options: EvidenceOption[]): string | null {
  const context = evidence.targetUnitId ? options.find((entry) => entry.id === evidence.targetUnitId) : null;
  if ((evidence.targetUnitId && !context) || !skill.trim() || skill.length > 100) return null;
  const text = `JD skill: ${skill.trim()}\nContext: ${context ? `${context.label} (${context.id})` : "General capability; do not attribute to a role or project"}\nEvidence: ${evidence.text}`;
  return text.length <= 1000 ? text : null;
}
