import { z } from "zod";

import { acceptedSkills, RESUME_RULES, RESUME_STRATEGY, resumeEvidenceSources, tailoredSkillsSchema } from "./tailor-resume";

import { DocumentKind, type Tone } from "@/generated/prisma/enums";
import { SIGN_OFF_UNIT, type Extracted, type Unit } from "@/lib/application-data";
import { emailParts } from "@/lib/application-email";
import { companyClaimsSchema, keepCandidateWarnings, RESEARCH_CLAIMS_RULE, RESEARCH_WRITING_RULES, researchForPrompt, validCompanyClaims, type CoverLetterResearch } from "@/lib/cover-letter-research";
import { isFrameUnit, isParagraph } from "@/lib/letter-frame";
import type { ProfileData } from "@/lib/profile";
import { TONES } from "@/lib/tones";
import { bulletLines, isBulletUnit } from "@/lib/unit-text";

import { guardSources, guardUnits, resumeFactSources } from "../fact-guard";

import {
  applicationFacts,
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

export const REGENERATE_UNIT_VERSION = "regenerate-unit@13";

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

const answerSchema = z.object({ text: z.string(), skills: tailoredSkillsSchema.nullable().optional(), companyClaims: companyClaimsSchema.nullable().optional() });

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
  research?: CoverLetterResearch | null;
};

/** APP-5: a fresh version of one part, the rest left alone; the unit comes back with its new text. */
export const regenerateUnit: Task<RegenerateInput, Unit> = async (provider, input, options) => {
  const { kind, unit, document, profile, extracted, tone, facts, posting } = input;
  const bullets = isBulletUnit(unit.id);
  const isProject = unit.id.startsWith("project:");
  const what = DOCUMENT_NAMES[kind];
  const letterBody = kind === DocumentKind.COVER_LETTER && isParagraph(unit);
  const research = letterBody ? input.research : null;
  const rewrite = (brief?: CoverLetterResearch | null) => provider.complete({
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
      letterBody && RESEARCH_WRITING_RULES,
      Boolean(brief?.findings.length) && RESEARCH_CLAIMS_RULE,
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
          letterBody && `Job posting (source material):\n${postingForPrompt(posting)}`,
          researchForPrompt(brief),
          applicationFacts(facts),
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
  let brief = research;
  let answer = await rewrite(brief);
  if (brief?.findings.length && !validCompanyClaims(answer.text, answer.companyClaims, brief)) {
    brief = null;
    answer = await rewrite();
  }
  const text = kind === DocumentKind.RESUME && unit.id === "skills" ? acceptedSkills(profile, answer.skills ?? [], facts) : bullets ? bulletLines(answer.text) : answer.text.trim();
  // An English sign-off stays the tone's.
  const updated = { ...unit, text: unit.id === SIGN_OFF_UNIT ? TONES[tone].signOff : text || unit.text };
  const flagLetter = () => {
    const checked = guardUnits([updated], guardSources(profile, extracted, posting, facts))[0];
    return { ...checked, unverified: keepCandidateWarnings(text, checked.unverified, answer.companyClaims, brief) };
  };
  return {
    // The letter's recipient and greeting aren't claims about the candidate.
    data:
      options.strict && !isFrameUnit(unit.id)
        ? kind === DocumentKind.COVER_LETTER
          ? flagLetter()
          // The email's greeting names its recipient, from the posting or typed in by the user.
          : guardUnits([updated], kind === DocumentKind.RESUME ? resumeFactSources(profile, facts) : guardSources(profile, extracted, [posting, emailParts(document).to].join("\n"), facts))[0]
        : { ...updated, unverified: undefined },
    promptVersion: REGENERATE_UNIT_VERSION,
  };
};
