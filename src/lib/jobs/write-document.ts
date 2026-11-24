import "server-only";

import { prepareCandidateProfile, assertCandidateContext } from "@/lib/memory/context";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { tailorResume } from "@/lib/ai/tasks";
import { documentStateSchema, readDocumentState } from "@/lib/document-state";
import { tailoredProfile } from "@/lib/resume-fit";
import { calendarDay } from "@/lib/application-documents";
import { extractedOf, matchSchema, unitsSchema, type Unit } from "@/lib/application-data";
import { documentLabels } from "@/lib/document-labels";
import { documentLanguage } from "@/lib/document-language";
import { saveVersion } from "@/lib/document-versions";
import { letterFormatting, sidebarLetterTheme, sidebarLetterUnits } from "@/lib/cover-letter-format";
import { newFrame, withFrame } from "@/lib/letter-frame";
import { prisma } from "@/lib/prisma";
import { profileOfApplication } from "@/lib/frozen-copy";
import { loadFactTexts } from "@/lib/profile-data";
import { sectionLayoutSchema, withoutSectionsOff } from "@/lib/resume-sections";
import { loadTheme } from "@/lib/theme-data";
import { BUILT_IN_THEMES } from "@/lib/themes";
import { loadSettings } from "@/lib/settings-data";

import { coverLetterFingerprint, type CoverLetterResearch } from "@/lib/cover-letter-research";
import { generateCoverLetter } from "./generate-cover-letter";
import { defineJob } from "./runner";

/** The key of writing an application's missing document, to find it again after a reload. */
export const writeDocumentJobKey = (applicationId: string, kind: WritableKind) => `document:${applicationId}:${kind}`;

const WRITABLE = [DocumentKind.RESUME, DocumentKind.COVER_LETTER] as const;
export type WritableKind = (typeof WRITABLE)[number];

/**
 * Writes the tailored resume or cover letter an application was created
 * without (#367), from what it was written for: the posting as read and
 * corrected, the match, the tone and its facts.
 */
export const writeDocumentJob = defineJob({
  type: "write-document",
  input: z.object({ applicationId: z.string().min(1), kind: z.enum(WRITABLE) }),
  result: z.object({ applicationId: z.string() }),
  async run({ applicationId, kind }, context) {
    const { step, signal } = context;
    if (kind === DocumentKind.RESUME) await step("Tailoring your resume");
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { documents: { select: { kind: true, state: true, units: true } } } });
    if (application.documents.some((document) => document.kind === kind)) return { applicationId };

    const [provider, options, fullProfile, settings] = await Promise.all([
      getAiProvider(),
      loadTaskOptions(),
      profileOfApplication(application.frozen),
      loadSettings(),
    ]);
    // Its own sections when it has them, or the base resume's (#297).
    const sections = sectionLayoutSchema.safeParse(application.sections);
    const currentResume = application.documents.find(document => document.kind === "RESUME");
    const local = readDocumentState(currentResume?.state);
    const localProfile = local && currentResume ? tailoredProfile(local.profile, unitsSchema.parse(currentResume.units)) : fullProfile;
    const evidenceProfile = await prepareCandidateProfile(localProfile, application.postingText, signal, provider);
    const profile = withoutSectionsOff(evidenceProfile, local?.sections ?? (sections.success ? sections.data : settings.resumeSections));
    const extracted = extractedOf(application);
    const parsedMatch = matchSchema.safeParse(application.match);
    const match = parsedMatch.success ? parsedMatch.data : { items: [] };
    const posting = application.postingText;
    // Newly generated prose is always English.
    const taskOptions = { ...options, signal };

    let units: Unit[];
    let writtenWith: string;
    let research: CoverLetterResearch | undefined;
    if (kind === DocumentKind.RESUME) {
      const resume = await tailorResume(provider, { profile, evidenceProfile, extracted, match, facts: await loadFactTexts(applicationId), posting }, taskOptions);
      units = resume.data;
      writtenWith = resume.promptVersion;
    } else {
      const letter = await generateCoverLetter(provider, { profile, extracted, match, tone: application.tone, facts: await loadFactTexts(applicationId), posting, postingUrl: application.postingUrl }, taskOptions, context);
      research = letter.research;
      const language = "English";
      // The sender and signature from the profile, and today's date, as a new application's letter has (E8-11).
      units = sidebarLetterUnits(withFrame(
        letter.data,
        newFrame({
          basics: profile.basics,
          company: application.company,
          location: application.location,
          date: calendarDay(),
          dateFormat: settings.dateFormat,
          lang: documentLanguage(language, letter.data.map((unit) => unit.text).join(" ")).lang,
          labels: documentLabels(language),
        }),
      ), application.role.trim() || profile.basics.headline);
      writtenWith = letter.promptVersion;
    }

    const theme = settings.baseThemeId ? await loadTheme(settings.baseThemeId) : null;
    try {
      await prisma.$transaction(async (tx) => {
        signal.throwIfAborted();
        await assertCandidateContext(evidenceProfile, tx);
        if (research) {
          const current = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { company: true, role: true, location: true, postingUrl: true, postingText: true } });
          if (coverLetterFingerprint(current) !== research.fingerprint) throw new Error("The job details changed while writing. Try again with the updated details.");
          // Guard the same fields during the update so a concurrent edit cannot save a stale brief.
          const { count } = await tx.application.updateMany({ where: { id: applicationId, ...current }, data: { coverLetterResearch: research } });
          if (!count) throw new Error("The job details changed while writing. Try again with the updated details.");
        }
        const state = documentStateSchema.parse({ version: 1, profile: evidenceProfile, role: application.role, language: "English", tone: application.tone, theme: kind === "COVER_LETTER" ? sidebarLetterTheme(theme ?? BUILT_IN_THEMES[0]) : theme ?? BUILT_IN_THEMES[0], paper: settings.paper ?? "A4", dateFormat: settings.dateFormat, sections: local?.sections ?? (sections.success ? sections.data : settings.resumeSections), showPhoto: application.showPhoto, followThemeLayout: application.followThemeLayout, includeReferences: (settings.includeRefs && extracted.asksForReferences) || (local?.sections ?? (sections.success ? sections.data : settings.resumeSections)).withReferences === true, letterDate: calendarDay().toISOString(), company: application.company, location: application.location, coverLetterLayout: kind === "COVER_LETTER" ? "SIDEBAR" : "CLASSIC", styles: kind === "COVER_LETTER" ? letterFormatting("SIDEBAR") ?? {} : {} });
        state.profile.facts = [];
        if (kind === "COVER_LETTER") {
          for (const key of ["experience", "projects", "education", "certifications", "publications", "references", "skills", "languages", "customSections"] as const) state.profile[key] = [];
          state.profile.photo = null;
        }
        const document = await tx.document.create({ data: { applicationId, kind, units, state: state as unknown as Prisma.InputJsonValue, initialLetterLayout: kind === "COVER_LETTER" ? "SIDEBAR" : null, themeId: settings.baseThemeId, writtenWith } });
        await saveVersion(tx, document.id, units, { cause: VersionCause.WRITTEN });
      });
    } catch (error) {
      // Written meanwhile, by another click: that one stays.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { applicationId };
      throw error;
    }
    return { applicationId };
  },
});
