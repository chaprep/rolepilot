import { z } from "zod";

import type { Tone } from "@/generated/prisma/enums";
import { SIGN_OFF_UNIT, unitsSchema, type Extracted, type Match, type Unit } from "@/lib/application-data";
import { companyClaimsSchema, keepCandidateWarnings, RESEARCH_CLAIMS_RULE, RESEARCH_WRITING_RULES, researchForPrompt, validCompanyClaims, type CoverLetterResearch } from "@/lib/cover-letter-research";
import type { ProfileData } from "@/lib/profile";
import { FRAME_LABELS, isFrameUnit } from "@/lib/letter-frame";
import { TONES } from "@/lib/tones";

import { guardSources, guardUnits } from "../fact-guard";

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

export const WRITE_COVER_LETTER_VERSION = "write-cover-letter@10";

const answerSchema = z.object({
  recipient: z.string(),
  greeting: z.string(),
  paragraphs: z.array(z.object({ label: z.string(), text: z.string(), companyClaims: companyClaimsSchema.nullable().optional() })),
  signOff: z.string(),
});

const INSTRUCTIONS = `You write a candidate's cover letter for one job, as JSON.

- recipient: the address block, one line per line: who it's for (the company's hiring team), then the place if the job has one. Usual for a letter in its language, e.g. "Ledgerly · Hiring team\\nAmsterdam".
- greeting: the salutation before the first paragraph, usual for a letter in its language, with its punctuation: address the hiring team, e.g. "Dear Ledgerly team,".
- paragraphs: four short paragraphs, about 200–300 words total. Keep the greeting and sign-off separate from the body.
  1. Hook: a specific reason the company and role are relevant. If the opening could work with a competitor's name substituted, make it more specific using the evidence.
  2. Proof: show one or two achievements. Explain the action, outcome and why it matters here. Use a concrete outcome when there is no verified metric.
  3. Future contribution: show how you could apply that experience to the role's priorities. Keep projections and inferred needs tentative.
  4. Close: express genuine interest and invite a conversation.
- label: a short English name for each paragraph's purpose.
- signOff: the closing line before the name, matching the tone, with its punctuation (e.g. "Warm regards,").
- The sender's name, contact details and the date are added from the profile; don't write them.`;

export type CoverLetterInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  tone: Tone;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted, for the fact guard. */
  posting: string;
  research?: CoverLetterResearch | null;
};

/**
 * APP-10: the letter's recipient and greeting (units "recipient" and
 * "greeting", E8-11), its paragraphs as units, then its sign-off (unit
 * "sign-off"), which matches the tone. The sender, date and signature come
 * from the profile when the application is created (src/lib/letter-frame.ts).
 */
export const writeCoverLetter: Task<CoverLetterInput, Unit[]> = async (provider, { profile, extracted, match, tone, facts, posting, research }, options) => {
  const draft = (brief?: CoverLetterResearch | null) => provider.complete({
    task: "write-cover-letter",
    system: system(
      INSTRUCTIONS,
      COVER_LETTER_APPROACH,
      RESEARCH_WRITING_RULES,
      Boolean(brief?.findings.length) && `Use at least one relevant finding in the hook or future contribution when the evidence supports a credible angle. ${RESEARCH_CLAIMS_RULE}`,
      `Tone: ${TONES[tone].label}. ${TONES[tone].description}`,
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
          `The job:\n${jobForPrompt(extracted, match)}`,
          `Job posting (source material):\n${postingForPrompt(posting)}`,
          researchForPrompt(brief),
          applicationFacts(facts),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "cover_letter",
    creativity: options.creativity,
    signal: options.signal,
  });

  let brief = research;
  let answer = await draft(brief);
  if (research?.findings.length && (
    !answer.paragraphs.some(({ companyClaims }) => companyClaims?.length) ||
    !answer.paragraphs.every(({ text, companyClaims }) => validCompanyClaims(text, companyClaims, research))
  )) {
    brief = null;
    answer = await draft();
  }
  const signOff = TONES[tone].signOff;
  const paragraphs = withoutFrame(answer.paragraphs, signOff).filter(paragraph => paragraph.text.trim());
  const units = unitsSchema.parse([
    // Left out when empty: the English ones fill in (src/lib/letter-frame.ts).
    ...(answer.recipient.trim() ? [{ id: "recipient", label: FRAME_LABELS.recipient, text: recipientFromJob(answer.recipient, extracted, posting) }] : []),
    ...(answer.greeting.trim() ? [{ id: "greeting", label: FRAME_LABELS.greeting, text: answer.greeting.trim() }] : []),
    ...paragraphs.map((paragraph, index) => ({ id: `paragraph:${index + 1}`, label: paragraph.label.trim() || `Paragraph ${index + 1}`, text: paragraph.text.trim() })),
    { id: SIGN_OFF_UNIT, label: "Sign-off", text: signOff },
  ]);
  return {
    // The recipient and greeting aren't claims about the candidate: only the paragraphs are checked.
    data: options.strict ? guardUnits(units, guardSources(profile, extracted, posting, facts)).map(unit => {
      if (isFrameUnit(unit.id)) return units.find(entry => entry.id === unit.id)!;
      if (!unit.unverified || !brief) return unit;
      const paragraph = paragraphs[Number(unit.id.split(":")[1]) - 1];
      const unverified = keepCandidateWarnings(unit.text, unit.unverified, paragraph?.companyClaims, brief);
      return unverified ? { ...unit, unverified } : { id: unit.id, label: unit.label, text: unit.text };
    }) : units,
    promptVersion: WRITE_COVER_LETTER_VERSION,
  };
};

const normalized = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The recipient as the model wrote it, but its place only from the job
 * (#371): who it's for stays, and a line after it stays only when the posting
 * says it. Otherwise the place is the posting's location as read, or left out
 * for a remote job. A model once gave the company the candidate's own city.
 */
export function recipientFromJob(text: string, extracted: Pick<Extracted, "location" | "company">, posting: string): string {
  const [who = "", ...rest] = tidyLines(text).split("\n");
  const job = normalized(`${posting}\n${extracted.location ?? ""}\n${extracted.company}`);
  const said = rest.filter((line) => job.includes(normalized(line)));
  const location = extracted.location?.trim() ?? "";
  const place = said.length > 0 ? said : location && !/\bremote\b/i.test(location) ? [location] : [];
  return [who, ...place].join("\n");
}

/** An address block's lines, trimmed, without empty ones. */
const tidyLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

const GREETING = /^\s*(?:dear|hi|hello|hey|good (?:morning|afternoon|day))\b[^\n]{0,60}[,!:]?\s*(?:\n|$)/i;

/**
 * The renderer adds the greeting, sign-off and name (APP-10); models add them
 * anyway sometimes. Takes a greeting line off the first paragraph and a
 * sign-off (with the name after it) off the last.
 */
export function withoutFrame<T extends { text: string }>(paragraphs: T[], signOff: string): T[] {
  if (paragraphs.length === 0) return paragraphs;
  const result = paragraphs.map((paragraph) => ({ ...paragraph }));
  result[0].text = result[0].text.replace(GREETING, "");
  const last = result.at(-1)!;
  const closings = [signOff, "Warm regards", "Kind regards", "Best regards", "Best", "Sincerely", "Yours sincerely", "Regards"];
  for (const closing of closings) {
    const escaped = closing.replace(/[,.]$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // On its own line, or right after the last sentence, maybe followed by a name.
    last.text = last.text.replace(new RegExp(`(?:\\n+|(?<=[.!?])[ \\t]+)\\s*${escaped}[,.]?(?:\\s*\\n[^\\n]{0,60})?\\s*$`, "i"), "").trim();
  }
  return result;
}
