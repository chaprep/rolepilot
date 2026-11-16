import { z } from "zod";

import { unitsSchema, type Extracted, type Match, type Unit } from "@/lib/application-data";
import { publicationLabel } from "@/lib/citation";
import { documentLabels, ENGLISH_LABELS, languagesLine, type DocumentLabels } from "@/lib/document-labels";
import { customSectionUnits } from "@/lib/custom-section-units";
import { certificationLabel, resumeCertifications, resumeCustomSections, resumePublications, sameName, type ProfileData } from "@/lib/profile";
import { inEditorOrder, skillsText } from "@/lib/skill-groups";

import { resumeFactSources, guardUnits } from "../fact-guard";

import {
  applicationFacts,
  candidateFacts,
  CREATIVITY,
  jobForPrompt,
  languageRule,
  NO_EM_DASHES,
  profileForPrompt,
  postingForPrompt,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";

export const TAILOR_RESUME_VERSION = "tailor-resume@10";

export const RESUME_RULES = `For resume edits, use the job description's terminology naturally where it accurately describes demonstrated capabilities. Tailor the summary, role and project bullets, education notes and skills to the job. Never invent tools, credentials, responsibilities, proficiency, metrics or outcomes, even when creativity is high or strict mode is off. A related tool is not an interchangeable tool. Job requirements and match gaps are context, not evidence about the candidate. A profile-match gap does not prove that experience or application facts lack transferable evidence.
For skills, return objects with name, group, and evidence: [{ sourceId, quote }]. Use the candidate evidence sources and quote an exact, meaningful passage supporting each skill. Select relevant original skills, accurate synonyms and evidence-supported transferable capabilities. Group skills under short job-relevant labels and rank by relevance, regardless of profile ordering. Preserve the meaning and proficiency. Do not use colons, middle dots or newlines inside skill names, or colons/middle dots/newlines inside group labels. For a changed skills section, return the complete desired list. For an unchanged skills section in an edit, return no skills edit. Never assign an application fact to a role/project unless its Context explicitly identifies that entry.`;

export const tailoredSkillSchema = z.union([
  z.string(), // Older providers/connector fixtures can still return original profile names.
  z.object({ name: z.string(), group: z.string(), evidence: z.array(z.object({ sourceId: z.string(), quote: z.string() })) }),
]);
export const tailoredSkillsSchema = z.array(tailoredSkillSchema);

/** Only the already privacy-filtered candidate data is eligible as evidence. */
export function resumeEvidenceSources(profile: ProfileData, facts: string[]): Record<string, string> {
  const clean = JSON.parse(profileForPrompt(profile)) as Record<string, unknown>;
  const sources: Record<string, string> = {};
  for (const key of ["summary", "skills", "experience", "projects", "education", "certifications", "publications", "otherSections", "factsAboutMe"]) {
    const value = clean[key];
    if (Array.isArray(value)) value.forEach((entry, index) => {
      const id = entry && typeof entry === "object" && "id" in entry ? entry.id : index;
      sources[`${key}:${id}`] = typeof entry === "string" ? entry : JSON.stringify(entry);
    });
    else if (typeof value === "string" && value.trim()) sources[key] = value;
  }
  facts.forEach((fact, index) => { if (fact.trim()) sources[`application:${index}`] = fact; });
  return sources;
}

export function acceptedSkills(profile: ProfileData, skills: z.infer<typeof tailoredSkillsSchema>, facts: string[] = []): string {
  const sources = resumeEvidenceSources(profile, facts);
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const seen = new Set<string>();
  return skillsText(skills.flatMap((skill) => {
    const original = typeof skill === "string" ? profile.skills.find((entry) => sameName(entry.name, skill)) : null;
    const name = (typeof skill === "string" ? original?.name ?? "" : skill.name).trim();
    const group = (typeof skill === "string" ? original?.group ?? "" : skill.group).trim();
    if (!name || name.length > 100 || group.length > 60 || /[:·\r\n]/.test(name + group) || seen.has(normalize(name))) return [];
    if (typeof skill !== "string" && !skill.evidence.some(({ sourceId, quote }) => {
      const source = sources[sourceId];
      return typeof source === "string" && normalize(quote).length >= 3 && normalize(source).includes(normalize(quote));
    })) return [];
    seen.add(normalize(name));
    return [{ name, group }];
  }));
}

const answerSchema = z.object({
  summary: z.string(),
  roles: z.array(z.object({ id: z.string(), bullets: z.array(z.string()) })),
  projects: z.array(z.object({ id: z.string(), bullets: z.array(z.string()) })),
  /** The profile's skills, most relevant first; leave out ones that don't help. */
  skills: tailoredSkillsSchema,
  education: z.array(z.object({ id: z.string(), notes: z.string() })),
});

const INSTRUCTIONS = `You tailor a candidate's resume to one job, as JSON.

- summary: 2–3 sentences in the first person without "I" at the start of every sentence, about the candidate as this job would see them.
- roles: every role from the profile, by id, with 2–5 bullets each, volunteering too. Lead with what this job cares about, keep each bullet to one line, and start with a verb.
- projects: every project from the profile, by id, with 1–3 bullets each, written like the roles' bullets: what was built and what it shows that this job cares about.
- skills: select relevant candidate-supported skills and return their job-suited names, groups and evidence as described below; omit irrelevant skills.
- education: every entry by id, with its notes shortened or left empty.
- The profile's certifications, publications and otherSections go on the resume word for word, so don't answer with them; the summary may mention them.`;

export type TailorInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted, for the fact guard. */
  posting: string;
};

/** APP-4: the tailored resume as units (summary, each role, each project, skills, each degree, each certification, each publication, languages). */
export const tailorResume: Task<TailorInput, Unit[]> = async (provider, { profile, extracted, match, facts, posting }, options) => {
  const answer = await provider.complete({
    task: "tailor-resume",
    system: system(
      INSTRUCTIONS,
      RESUME_RULES,
      truthfulness(options.strict),
      candidateFacts(profile, facts),
      CREATIVITY[options.creativity],
      languageRule(options.language),
      UNTRUSTED_POSTING,
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `The job:\n${jobForPrompt(extracted, match)}`,
          `Original posting (reference only; corrected job details above take precedence):\n${postingForPrompt(posting)}`,
          `Candidate evidence sources:\n${JSON.stringify(resumeEvidenceSources(profile, facts))}`,
          applicationFacts(facts),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "tailored_resume",
    creativity: options.creativity,
    signal: options.signal,
  });
  // The languages line in the resume's language: the chosen one, or the posting's.
  const units = resumeUnits(profile, { ...answer, skills: [] }, documentLabels(options.language ?? extracted.language));
  units.find((unit) => unit.id === "skills")!.text = acceptedSkills(profile, answer.skills, facts);
  // E6-6: in strict mode, note what the profile and posting don't back.
  return {
    data: options.strict ? guardUnits(units, resumeFactSources(profile, facts)) : units,
    promptVersion: TAILOR_RESUME_VERSION,
  };
};

/**
 * Turns the answer into units, trusting nothing: unknown roles, projects and
 * degrees are dropped, skills must be the profile's own, and a role or
 * project the model skipped keeps its bullets from the profile. The certifications, publications,
 * custom sections and languages come from the profile, all but the languages word for word (#293, #218, #298),
 * and languages with their levels in the words of `labels`.
 */
export function resumeUnits(profile: ProfileData, answer: Omit<z.infer<typeof answerSchema>, "skills"> & { skills: string[] }, labels: DocumentLabels = ENGLISH_LABELS, { keepSkillOrder = false } = {}): Unit[] {
  const roles = new Map(answer.roles.map((role) => [role.id, role.bullets]));
  const projects = new Map(answer.projects.map((project) => [project.id, project.bullets]));
  const notes = new Map(answer.education.map((entry) => [entry.id, entry.notes]));
  const kept = [...new Set(answer.skills.flatMap((name) => profile.skills.find((skill) => sameName(skill.name, name)) ?? []))];
  // In the profile's order when the user set one (public issue 62), else as the model ranked them.
  const skills = keepSkillOrder ? inEditorOrder(profile.skills).filter((skill) => kept.includes(skill)) : kept;
  const units: Unit[] = [
    { id: "summary", label: "Summary", text: answer.summary.trim() },
    ...profile.experience.map((entry) => {
      const bullets = (roles.get(entry.id) ?? entry.bullets.split("\n")).map((line) => line.trim()).filter(Boolean);
      return { id: `experience:${entry.id}`, label: `${entry.company || entry.role} ${entry.volunteering ? "volunteering" : "role"}`, text: bullets.join("\n") };
    }),
    ...profile.projects.map((entry) => {
      const bullets = (projects.get(entry.id) ?? entry.bullets.split("\n")).map((line) => line.trim()).filter(Boolean);
      return { id: `project:${entry.id}`, label: `${entry.name || "Untitled"} project`, text: bullets.join("\n") };
    }),
    // Most relevant first, a line per group where its first skill comes (#280).
    { id: "skills", label: "Skills", text: skillsText(skills) },
    ...profile.education.map((entry) => ({
      id: `education:${entry.id}`,
      label: entry.degree || entry.school,
      text: (notes.get(entry.id) ?? entry.notes).trim(),
    })),
    ...resumeCertifications(profile.certifications).map((entry) => ({
      id: `certification:${entry.id}`,
      label: certificationLabel(entry.name),
      text: entry.name.trim(),
    })),
    ...resumePublications(profile.publications).map((entry) => ({
      id: `publication:${entry.id}`,
      label: publicationLabel(entry.citation),
      text: entry.citation.trim(),
    })),
    ...resumeCustomSections(profile.customSections).flatMap(customSectionUnits),
    {
      id: "languages",
      label: "Languages",
      text: languagesLine(profile.languages, labels),
    },
  ];
  return unitsSchema.parse(units);
}

/** The resume's units with the profile's own words, for adding a section to a resume that exists (#297). */
export function profileUnits(profile: ProfileData, labels: DocumentLabels = ENGLISH_LABELS): Unit[] {
  return resumeUnits(
    profile,
    { summary: profile.basics.summary, roles: [], projects: [], skills: inEditorOrder(profile.skills).map((skill) => skill.name), education: [] },
    labels,
  );
}
