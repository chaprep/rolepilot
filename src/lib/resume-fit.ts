import { z } from "zod";

import type { Unit } from "@/lib/application-data";
import { sameName, type ProfileData } from "@/lib/profile";
import { skillNamesIn, skillLine } from "@/lib/skill-groups";

// How well an application's tailored resume fits its posting (#370), scored on
// request by the scorer in Settings → Scoring: Jev, or the AI model. It reads
// the resume as a profile: the profile's own entries, with the tailored text.

/** Application.resumeFit */
export const resumeFitSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  redFlags: z.array(z.string()),
  /** The scorer and its version, e.g. "score-posting@2" or "score-posting-jev@1". */
  scoredWith: z.string(),
  scoredAt: z.iso.datetime(),
});
export type ResumeFit = z.infer<typeof resumeFitSchema>;

/**
 * The tailored resume as a profile, for a scorer: what the resume says, and
 * nothing it left out. Its summary, the roles, projects, degrees,
 * certifications and publications it has, with its text, and the skills it
 * lists. Facts about the candidate aren't on a resume, so they're left out.
 */
export function tailoredProfile(profile: ProfileData, units: Unit[]): ProfileData {
  const text = (id: string) => units.find((unit) => unit.id === id)?.text;
  const listed = (prefix: string) => (entry: { id: string }) => text(`${prefix}${entry.id}`) !== undefined;
  const skills = text("skills");
  const skillNames = skills === undefined ? null : skillNamesIn(skills);
  const groups = new Map((skills ?? "").split("\n").flatMap(line => skillNamesIn(line).map(name => [name, skillLine(line).label ?? ""] as const)));
  return {
    ...profile,
    basics: { ...profile.basics, summary: text("summary") ?? "" },
    experience: profile.experience.filter(listed("experience:")).map((entry) => ({ ...entry, bullets: text(`experience:${entry.id}`)! })),
    projects: profile.projects.filter(listed("project:")).map((entry) => ({ ...entry, bullets: text(`project:${entry.id}`)! })),
    education: profile.education.filter(listed("education:")).map((entry) => ({ ...entry, notes: text(`education:${entry.id}`)! })),
    certifications: profile.certifications.filter(listed("certification:")).map(entry => ({ ...entry, name: text(`certification:${entry.id}`)! })),
    publications: profile.publications.filter(listed("publication:")).map(entry => ({ ...entry, citation: text(`publication:${entry.id}`)! })),
    customSections: profile.customSections.flatMap(section => {
      if (section.format === "INLINE") {
        const value = text(`custom-inline:${section.id}`);
        return value === undefined ? [] : [{ ...section, items: value.split("\n").filter(Boolean).map((title, index) => ({ id: `local-inline-${index}`, title, subtitle: "", details: "", link: "", onResumes: true, startYear: null, startMonth: null, endYear: null, endMonth: null, current: false })) }];
      }
      const prefix = section.format === "ENTRIES" ? "custom-entry:" : "custom-line:";
      const items = section.items.filter(listed(prefix)).map(item => ({ ...item, ...(section.format === "ENTRIES" ? { details: text(`${prefix}${item.id}`)! } : { title: text(`${prefix}${item.id}`)! }) }));
      return items.length ? [{ ...section, items }] : [];
    }),
    skills: skillNames === null ? profile.skills : skillNames.map((name, index) => ({ ...(profile.skills.find((skill) => sameName(name, skill.name)) ?? { id: `resume-skill:${index}`, name }), group: groups.get(name) ?? "" })),
    facts: [],
  };
}

/** Keep local metadata useful to later AI work without losing omitted entries needed by Put back. */
export function synchronizeDocumentProfile(profile: ProfileData, units: Unit[]): ProfileData {
  const written = tailoredProfile(profile, units);
  const merge = <T extends { id: string }>(saved: T[], updates: T[]) => saved.map(entry => updates.find(update => update.id === entry.id) ?? entry).concat(updates.filter(update => !saved.some(entry => entry.id === update.id)));
  return { ...profile, basics: written.basics,
    experience: merge(profile.experience, written.experience), projects: merge(profile.projects, written.projects), education: merge(profile.education, written.education),
    certifications: merge(profile.certifications, written.certifications), publications: merge(profile.publications, written.publications), skills: merge(profile.skills, written.skills),
  };
}
