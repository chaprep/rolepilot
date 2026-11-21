import { z } from "zod";

import type { CompanyResearch } from "@/lib/research/schema";
import { acceptedSkills, RESUME_RULES, RESUME_STRATEGY, resumeEvidenceSources, tailoredSkillsSchema } from "./tailor-resume";

import { DocumentKind, type Tone } from "@/generated/prisma/enums";
import { SIGN_OFF_UNIT, type Extracted, type Unit } from "@/lib/application-data";
import { emailParts } from "@/lib/application-email";
import { isFrameUnit } from "@/lib/letter-frame";
import type { ProfileData } from "@/lib/profile";
import { TONES } from "@/lib/tones";
import { bulletLines, isBulletUnit } from "@/lib/unit-text";

import { guardCoverLetter, guardSources, guardUnits, resumeFactSources } from "../fact-guard";

import {
  applicationFacts,
  companyResearchForPrompt,
  candidateFacts,
  COVER_LETTER_APPROACH,
  CREATIVITY,
  jobForPrompt,
  ENGLISH_WRITING,
  NO_EM_DASHES,
  profileForPrompt,
  postingForPrompt,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";

import { EMAIL_WRITING_BRIEF } from "./write-email";

export const REGENERATE_UNIT_VERSION = "regenerate-unit@11";

/** What the letter's frame parts are, for the model (E8-11). */
const FRAME_PARTS: Record<string, string> = {
  greeting:
    "It's the letter's greeting: the salutation before the first paragraph, usual for a letter in its language, with its punctuation, to the contact person the posting names, else the hiring team.",
  recipient:
    "It's the letter's address block, one line per line: who it's for (the company's hiring team, or the contact person the posting names, at the company), then the place if the job has one.",
};

/** What the email's parts are, for the model. */
const EMAIL_PARTS: Record<string, string> = {
  subject: "It's the email's subject line: the role and the candidate's name, or the reference or subject line the posting asks for. One line.",
  body: `It's the email's whole message. ${EMAIL_WRITING_BRIEF} A blank line between paragraphs.`,
};

/** What each document is called in the prompt. */
const DOCUMENT_NAMES: Record<DocumentKind, string> = {
  [DocumentKind.RESUME]: "resume",
  [DocumentKind.COVER_LETTER]: "cover letter",
  [DocumentKind.EMAIL]: "application email",
};

const answerSchema = z.object({ text: z.string(), skills: tailoredSkillsSchema.nullable().optional() });

export type RegenerateInput = {
  kind: DocumentKind;
  /** The part to write again. */
  unit: Unit;
  /** The whole document, for context and to avoid repeating other parts. */
  document: Unit[];
  profile: ProfileData;
  extracted: Extracted;
  tone: Tone;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted, for the fact guard. */
  posting: string;
  companyResearch?: CompanyResearch;
};

/** APP-5: a fresh version of one part, the rest left alone; the unit comes back with its new text. */
export const regenerateUnit: Task<RegenerateInput, Unit> = async (provider, input, options) => {
  const { kind, unit, document, profile, extracted, tone, facts, posting } = input;
  const bullets = isBulletUnit(unit.id);
  const isProject = unit.id.startsWith("project:");
  const what = DOCUMENT_NAMES[kind];
  const answer = await provider.complete({
    task: "regenerate-unit",
    system: system(
      `You write a new version of one part of a candidate's ${what} for one job, as JSON with the new text.`,
      `Keep its purpose and about its length, but phrase it differently from the current version, and don't repeat what other parts already say.${
        bullets
          ? isProject
            ? " It's a project: answer 1–3 bullets, one per line, each starting with a verb, without bullet characters."
            : " It's a role: answer 2–5 bullets, one per line, each starting with a verb, without bullet characters."
          : ""
      }`,
      // The letter's greeting and address block aren't where its argument goes.
      kind === DocumentKind.COVER_LETTER && !isFrameUnit(unit.id) && COVER_LETTER_APPROACH,
      kind !== DocumentKind.RESUME && `Tone: ${TONES[tone].label}. ${TONES[tone].description}`,
      kind === DocumentKind.COVER_LETTER && FRAME_PARTS[unit.id],
      kind === DocumentKind.EMAIL && EMAIL_PARTS[unit.id],
      kind === DocumentKind.RESUME && RESUME_RULES,
      kind === DocumentKind.RESUME && RESUME_STRATEGY,
      kind === DocumentKind.RESUME && unit.id === "skills" && "Return the full grouped skills list in skills; text is ignored for this section.",
      truthfulness(options.strict, options.creativity),
      candidateFacts(profile, facts),
      CREATIVITY[options.creativity],
      ENGLISH_WRITING,
      UNTRUSTED_POSTING,
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `The job:\n${jobForPrompt(extracted, null)}`,
          `The whole ${what} now:\n${JSON.stringify(document, null, 2)}`,
          kind === DocumentKind.RESUME && `Original posting (reference only):\n${postingForPrompt(posting)}`,
          kind === DocumentKind.RESUME && `Candidate evidence sources:\n${JSON.stringify(resumeEvidenceSources(profile, facts))}`,
          applicationFacts(facts),
          kind === DocumentKind.COVER_LETTER && companyResearchForPrompt(input.companyResearch),
          `Write a new version of "${unit.label}" (${unit.id}). Its current text:\n${unit.text}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "new_text",
    creativity: options.creativity,
    signal: options.signal,
  });
  const text = kind === DocumentKind.RESUME && unit.id === "skills" ? acceptedSkills(profile, answer.skills ?? [], facts) : bullets ? bulletLines(answer.text) : answer.text.trim();
  // An English sign-off stays the tone's.
  const updated = { ...unit, text: unit.id === SIGN_OFF_UNIT ? TONES[tone].signOff : text || unit.text };
  return {
    // The letter's recipient and greeting aren't claims about the candidate.
    data:
      options.strict && !isFrameUnit(unit.id)
        ? kind === DocumentKind.COVER_LETTER
          ? guardCoverLetter([updated], guardSources(profile, extracted, posting, facts), profile.basics.name, input.companyResearch)[0]
          // The email's greeting names its recipient, from the posting or typed in by the user.
          : guardUnits([updated], kind === DocumentKind.RESUME ? resumeFactSources(profile, facts) : guardSources(profile, extracted, [posting, emailParts(document).to].join("\n"), facts))[0]
        : { ...updated, unverified: undefined },
    promptVersion: REGENERATE_UNIT_VERSION,
  };
};
