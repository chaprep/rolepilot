import { z } from "zod";

import type { Tone } from "@/generated/prisma/enums";
import type { Extracted, Match, Unit } from "@/lib/application-data";
import { emailUnits, isEmailAddress } from "@/lib/application-email";
import type { ProfileData } from "@/lib/profile";
import { TONES } from "@/lib/tones";

import { guardSources, guardUnits } from "../fact-guard";

import {
  applicationFacts,
  candidateFacts,
  CREATIVITY,
  jobForPrompt,
  ENGLISH_WRITING,
  NO_EM_DASHES,
  postingForPrompt,
  profileForPrompt,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";
import { withoutFrame } from "./write-cover-letter";

export const WRITE_EMAIL_VERSION = "write-email@5";

const answerSchema = z.object({
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  subject: z.string(),
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signOff: z.string(),
});

export const EMAIL_WRITING_BRIEF = `Write a personal application email from the candidate to the company.

Use three body paragraphs with this progression:

1. Interest and relevant background
Open with interest in the company and the role. Make the connection specific when the available information supports it. Introduce the candidate's relevant background, drawing on their primary work, specialization, relevant employers, and a contribution that demonstrates their fit. Include years of experience and the team name only when supported.

2. Strengths and concrete work
Develop the strongest connection between the candidate's experience and this role. Show their capabilities through specific responsibilities, projects, systems, or achievements. Where relevant, explain how they work across disciplines or deliver work from beginning to end. Select the most persuasive examples rather than listing every skill or employer. Build on the first paragraph without repeating it.

3. Interest in joining
Close by expressing interest in joining the company or team and contributing to its work. Connect that contribution to the opportunity where possible. End with a friendly invitation to continue the conversation.

You have freedom over wording, sentence structure, paragraph lengths, and emphasis. Preserve this progression, but write each email naturally for the specific candidate and opportunity. Let the available evidence determine which details deserve space.

Voice and style:
- Conversational, confident, warm, and professional.
- Sound like a person reaching out directly.
- Use clear language and concrete details.
- Express interest without exaggerated praise or invented familiarity.
- Avoid generic claims, buzzwords, long skill lists, and repetitive sentences.
- Use the resume and cover letter as context without copying their prose.
- Keep the email focused; do not stretch it to fill space.
- Do not use em dashes.

Factual boundaries:
- Use only facts supported by the supplied profile, application notes, and job posting.
- Never invent years of experience, employers, team names, projects, responsibilities, metrics, or achievements.
- Do not turn related experience into a claim of direct experience.
- Omit missing details naturally. Never leave placeholders in the email.
- Do not force a particular number of employers, skills, or examples.

Format:
Hi,

[Three body paragraphs]

Best,
[Candidate's name]

Do not add an attachment paragraph, portfolio link, or LinkedIn signature.`;

const INSTRUCTIONS = `You write the email a candidate sends their job application with, as JSON.

${EMAIL_WRITING_BRIEF}

- contactName and contactEmail: the person and the email address the posting says to send applications to, exactly as the posting writes them. Use null for anything the posting doesn't give; never guess an address.
- subject: a clear subject line with the role and the candidate's name, e.g. "Application: Senior Product Designer, Jane Doe". If the posting asks for a reference number or a particular subject line, use that.
- greeting: exactly "Hi,".
- paragraphs: exactly three body paragraphs following the writing brief above: interest and relevant background; strengths and concrete projects; interest in joining and contributing to the team. No greeting, sign-off or name in them: those are separate.
- signOff: exactly "Best,".
- The candidate's name is added after the sign-off; don't write it.`;

export type EmailInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  tone: Tone;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted: where to send the application, and for the fact guard. */
  posting: string;
  /** The cover letter's paragraphs, so the email doesn't repeat them. */
  letter: string[];
};

/**
 * The application's email (its Email tab): the recipient the posting names,
 * a subject and the message, as the units "to", "subject" and "body". The
 * message ends with the sign-off and the candidate's name. An address the
 * posting doesn't contain is never used, so the recipient may be empty.
 */
export const writeEmail: Task<EmailInput, Unit[]> = async (provider, { profile, extracted, match, tone, facts, posting, letter }, options) => {
  const answer = await provider.complete({
    task: "write-email",
    system: system(
      INSTRUCTIONS,
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
          letter.length > 0 && `The cover letter it goes with:\n${letter.join("\n\n")}`,
          applicationFacts(facts),
          `The posting, for who to send it to and how:\n${postingForPrompt(posting)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "application_email",
    creativity: options.creativity,
    signal: options.signal,
  });

  const signOff = "Best,";
  const paragraphs = withoutFrame(answer.paragraphs.map((text) => ({ text })), signOff)
    .map((paragraph) => paragraph.text.trim())
    .filter(Boolean);
  const body = ["Hi,", ...paragraphs, [signOff, profile.basics.name.trim()].filter(Boolean).join("\n")]
    .filter(Boolean)
    .join("\n\n");

  const [to, ...written] = emailUnits({ to: recipient(answer.contactName, answer.contactEmail, posting), subject: oneLine(answer.subject), body });
  return {
    // The recipient comes from the posting; the subject and message are checked like the letter's paragraphs.
    data: [to, ...(options.strict ? guardUnits(written, guardSources(profile, extracted, posting, facts)) : written)],
    promptVersion: WRITE_EMAIL_VERSION,
  };
};

/**
 * "John Doe <john@example.com>", or just the address. Empty unless the
 * posting has the address, so a guessed one is never used.
 */
export function recipient(name: string | null, address: string | null, posting: string): string {
  const email = address?.trim().replace(/^mailto:/i, "") ?? "";
  if (!isEmailAddress(email) || !posting.toLowerCase().includes(email.toLowerCase())) return "";
  const who = oneLine(name ?? "").replace(/[<>"]/g, "");
  return who && who.toLowerCase() !== email.toLowerCase() ? `${who} <${email}>` : email;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
