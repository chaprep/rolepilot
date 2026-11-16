import "server-only";

import { z } from "zod";

import { readDocumentState } from "@/lib/document-state";
import { profileOfApplication } from "@/lib/frozen-copy";
import { DocumentKind } from "@/generated/prisma/enums";
import { AiError } from "@/lib/ai/errors";
import { unitsSchema } from "@/lib/application-data";
import { prisma } from "@/lib/prisma";
import { sectionLayoutSchema, withoutSectionsOff } from "@/lib/resume-sections";
import { resumeFitSchema, tailoredProfile, type ResumeFit } from "@/lib/resume-fit";
import { loadPostingScorer } from "@/lib/scoring";
import { loadSettings } from "@/lib/settings-data";

import { defineJob } from "./runner";

/** The key of scoring an application's resume, to find it again after a reload. */
export const scoreResumeJobKey = (applicationId: string) => `resume-score:${applicationId}`;

/**
 * Score / Score again (#370): how well the application's tailored resume, as
 * it is now, fits its posting, by the scorer in Settings → Scoring (Jev, or
 * the AI model). Kept on the application until it's scored again.
 */
export const scoreResumeJob = defineJob({
  type: "score-resume",
  input: z.object({ applicationId: z.string().min(1) }),
  result: resumeFitSchema,
  async run({ applicationId }, { step, signal }) {
    await step("Scoring the resume");
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { documents: { where: { kind: DocumentKind.RESUME }, select: { units: true, state: true, updatedAt: true } } },
    });
    const units = unitsSchema.safeParse(application.documents[0]?.units);
    // Said as it is, like an AI provider that isn't set up.
    if (!units.success) throw AiError.config("This application has no tailored resume to score. Write it first.");

    const [fullProfile, settings, score] = await Promise.all([profileOfApplication(application.frozen), loadSettings(), loadPostingScorer()]);
    const sections = sectionLayoutSchema.safeParse(application.sections);
    const state = readDocumentState(application.documents[0].state);
    const profile = tailoredProfile(withoutSectionsOff(state?.profile ?? fullProfile, state?.sections ?? (sections.success ? sections.data : settings.resumeSections)), units.data);
    const languageText = units.data.find(unit => unit.id === "languages")?.text.trim();
    if (languageText) {
      // The scorer receives the actual written language claim without guessing a proficiency enum.
      profile.basics.summary += `\nLanguages as written on this resume: ${languageText}`;
      profile.languages = [];
    }
    const { data, scoredWith } = await score(
      {
        title: application.role || application.title,
        company: application.company,
        place: application.location,
        remote: /\bremote\b/i.test(`${application.mode} ${application.location}`) ? true : null,
        salary: application.salary,
        description: application.postingText,
      },
      profile,
      signal,
    );
    const fit: ResumeFit = { ...data, scoredWith, scoredAt: new Date().toISOString() };
    await prisma.$transaction(async (tx) => {
      // Lock the same document row as edits before publishing the score.
      const { count } = await tx.document.updateMany({ where: { applicationId, kind: DocumentKind.RESUME, updatedAt: application.documents[0].updatedAt }, data: { updatedAt: application.documents[0].updatedAt } });
      if (!count) throw AiError.config("The resume changed while scoring. Score it again.");
      await tx.application.update({ where: { id: applicationId }, data: { resumeFit: fit } });
    });
    return fit;
  },
});
