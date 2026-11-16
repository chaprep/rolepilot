import type { JsonCompletionRequest } from "../provider";
import { z } from "zod";
import { acceptedSkills, RESUME_RULES, resumeEvidenceSources, tailoredSkillsSchema } from "./tailor-resume";

import { DocumentKind, Tone } from "@/generated/prisma/enums";
import { SIGN_OFF_UNIT, type Extracted, type Unit, type UnitEdit } from "@/lib/application-data";
import { emailParts } from "@/lib/application-email";
import { withoutPrivateParts, isFrameUnit } from "@/lib/letter-frame";
import type { ProfileData } from "@/lib/profile";
import { TONES } from "@/lib/tones";
import { skillLine, skillNamesIn, skillsText } from "@/lib/skill-groups";
import { sameName } from "@/lib/profile";
import { DOCUMENT_OPERATIONS, documentOperationSchema, privateFieldSchema, stateForPrompt, type DocumentOperation, type DocumentState, type PrivateField } from "@/lib/document-state";
import { THEME_FONTS, BUILT_IN_THEMES, type ThemeData } from "@/lib/themes";
import { isVerbatimUnit } from "@/lib/unit-text";

import { guardSources, resumeFactSources, unverifiedFacts } from "../fact-guard";

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

export const REFINE_CHAT_VERSION = "refine-chat@13";

const answerSchema = z.object({
  reply: z.string(),
  edits: z.array(z.object({ document: z.enum(DocumentKind), unitId: z.string(), text: z.string(), skills: tailoredSkillsSchema.nullable().optional() })),
  /** A different cover letter tone, only when asked for one. */
  tone: z.enum(Tone).nullable(),
  declined: z.boolean(),
  operations: z.array(documentOperationSchema).max(100).nullable().optional(),
  requestedFields: z.array(privateFieldSchema).max(20).nullable().optional(),
  privateEditsRequested: z.boolean().nullable().optional(),
});

const INSTRUCTIONS = `You help a candidate refine their tailored resume, cover letter and application email for one job, and answer as JSON.

- Change only what the request asks for. Each edit replaces one unit's whole text: give its document (RESUME, COVER_LETTER or EMAIL), its unitId and the new text. For a role or project, write bullets one per line without bullet characters.
- The email goes out with the resume and cover letter attached. Its "to" unit is the recipient ("Name <address>"), "subject" its subject line and "body" the whole message, from the greeting to the sign-off and the candidate's name.
- tone: set it (WARM, DIRECT or FORMAL) only when the request asks for a different tone for the letter; otherwise null. When you change the tone, rewrite the letter's paragraphs to match. A different tone for the email is an edit to the email, not a new tone.
- reply: one or two friendly sentences saying what you changed, or why you didn't.`;

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type RefineInput = {
  request: string;
  /** Server-constrained evidence update; never changes other documents. */
  evidenceUnits?: string[];
  evidenceFact?: string;
  documentStates?: Partial<Record<DocumentKind, DocumentState>>;
  themes?: ThemeData[];
  privateFields?: (PrivateField & { value: string })[];
  /** Earlier messages, oldest first. */
  history: ChatTurn[];
  /** The unit the request is about, if the user picked one ("About: Summary"). */
  target: string | null;
  /** The document on screen, which a request without a target is most likely about. */
  viewing?: DocumentKind | null;
  resume: Unit[];
  letter: Unit[];
  /** The application's email, when it has one. */
  email?: Unit[];
  profile: ProfileData;
  extracted: Extracted;
  tone: Tone;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted, for the fact guard. */
  posting: string;
};

export type Refinement = { reply: string; edits: UnitEdit[]; tone: Tone | null; declined: boolean; operations?: DocumentOperation[] };

/** How the request says which document is on screen. */
const LOOKING_AT: Record<DocumentKind, string> = {
  [DocumentKind.RESUME]: "the resume",
  [DocumentKind.COVER_LETTER]: "the cover letter",
  [DocumentKind.EMAIL]: "the email",
};

/** Only the last messages go along; older ones rarely matter and cost context. */
const HISTORY = 10;

/** APP-7, APP-9: a reply plus unit edits (with what they replace, for Undo), or a decline with guidance. */
export const refineChat: Task<RefineInput, Refinement> = async (provider, input, options) => {
  const { request, history, target, viewing, resume, letter, email = [], profile, extracted, tone, facts, posting } = input;
  const looking = viewing ? LOOKING_AT[viewing] : null;
  const completion: JsonCompletionRequest<z.infer<typeof answerSchema>> = {
    task: "refine-chat",
    system: system(
      INSTRUCTIONS,
      !input.evidenceUnits && input.documentStates && DOCUMENT_OPERATIONS,
      `Current letter tone: ${TONES[tone].label}.`,
      input.evidenceUnits
        ? system(RESUME_RULES, truthfulness(options.strict), candidateFacts(profile, facts), CREATIVITY[options.creativity], "For a RESUME skills edit include structured skills alongside text; text is ignored for that edit. Candidate-provided application facts count as evidence even when absent from the global profile.", `This is an application-evidence update. Edit only RESUME units: ${input.evidenceUnits.join(", ")}. Keep all other text and documents unchanged; tone must be null.`)
        : "Apply the user's explicit content changes to the requested application documents. Treat details and wording they supply or explicitly ask to include as authorized content, even when absent from their profile or application facts. Do not require a profile update or supporting evidence. Every existing text unit, including skills, certifications, publications and custom sections, is editable. For skills, return the complete replacement in text; structured skills evidence is unnecessary. To clear a unit, return an empty text string. Do not invent additional changes beyond the request. Set declined to false for supported content edits; explain honestly when a request cannot be performed with the available text units.",
      languageRule(options.language),
      UNTRUSTED_POSTING,
      NO_EM_DASHES,
      !input.evidenceUnits && "The user's explicit wording, language and style requests take precedence over default language and style preferences. Edit only the document and content requested; use the document on screen when the request does not specify one.",
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(input.documentStates && !input.evidenceUnits ? { ...profile, basics: { ...profile.basics, name: "[private]" } } : profile)}`,
          `The job:\n${jobForPrompt(extracted, null)}`,
          `The resume's units:\n${JSON.stringify(resume, null, 2)}`,
          `The cover letter's units:\n${JSON.stringify(withoutPrivateParts(letter), null, 2)}`,
          email.length > 0 && `The email's units:\n${JSON.stringify(email, null, 2)}`,
          `Original posting (reference only; corrected job details above take precedence):\n${postingForPrompt(posting)}`,
          `Candidate evidence sources:\n${JSON.stringify(resumeEvidenceSources(profile, facts))}`,
          input.evidenceFact && `Submitted candidate evidence (use this example for this update):\n${JSON.stringify(input.evidenceFact)}`,
          applicationFacts(facts),
          !input.evidenceUnits && input.documentStates && `Current independent document inputs (use these over global defaults):\n${JSON.stringify(Object.fromEntries(Object.entries(input.documentStates).map(([kind, state]) => [kind, stateForPrompt(state!)])))}`,
          !input.evidenceUnits && input.documentStates && `Available themes:\n${JSON.stringify(input.themes?.length ? input.themes : BUILT_IN_THEMES)}`,
          !input.evidenceUnits && input.documentStates && `Registered fonts:\n${JSON.stringify(Object.keys(THEME_FONTS))}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      { role: "assistant", content: "Understood. What would you like to change?" },
      ...history.slice(-HISTORY).map((turn) => ({ role: turn.role, content: turn.text })),
      { role: "user", content: target ? `About ${target}: ${request}` : looking ? `(I'm looking at ${looking}.) ${request}` : request },
    ],
    schema: answerSchema,
    schemaName: "refinement",
    creativity: options.creativity,
    signal: options.signal,
    maxTokens: input.documentStates ? 16_384 : undefined,
  };
  let answer = await provider.complete<z.infer<typeof answerSchema>>(completion);
  let contactIntent = Boolean(answer.privateEditsRequested) || /\((sender|contacts|signature)\)/.test(input.target ?? "");
  if (!input.evidenceUnits && answer.requestedFields?.length) {
    if (!contactIntent) throw new Error("Private fields may only be read for an explicit header, contact or signature request.");
    const requested = answer.requestedFields.map(field => input.privateFields?.find(value => value.document === field.document && value.field === field.field)).filter(value => value !== undefined);
    if (requested.length !== answer.requestedFields.length) throw new Error("The requested private field is unavailable in this document.");
    answer = await provider.complete<z.infer<typeof answerSchema>>({ ...completion, messages: [...completion.messages, { role: "assistant", content: JSON.stringify(answer) }, { role: "user", content: `Only the requested displayed fields for this edit:\n${JSON.stringify(requested)}\nReturn final operations/edits now; do not request more fields.` }] });
    contactIntent ||= Boolean(answer.privateEditsRequested);
    if (answer.requestedFields?.length) throw new Error("The requested edit could not be completed with the scoped fields.");
  }

  if (!input.evidenceUnits && !contactIntent && answer.operations?.some(operation => operation.type === "metadata" && /^(basics\.(name|email|phone|address|dob|website|linkedin)|references\.)/.test(operation.path) || operation.type === "unit" && ["sender", "contacts", "signature"].includes(operation.id) || operation.type === "entry" && operation.collection === "references")) throw new Error("Contact edits require an explicit contact request.");
  const newTone = !input.evidenceUnits && answer.tone && answer.tone !== tone ? answer.tone : null;
  // The email's recipient counts too: its greeting names them, from the posting or typed in by the user.
  const sources = options.strict ? guardSources(profile, extracted, [posting, emailParts(email).to].join("\n"), facts) : null;
  const documents = { [DocumentKind.RESUME]: resume, [DocumentKind.COVER_LETTER]: letter, [DocumentKind.EMAIL]: email };
  // Only units that exist, each once; the text they replace is kept for Undo (APP-8).
  const edits = new Map<string, UnitEdit>();
  if (!answer.declined) {
    for (const edit of answer.edits) {
      if (edit.document === DocumentKind.COVER_LETTER && ["sender", "contacts", "signature"].includes(edit.unitId) && !contactIntent) continue;
      const unit = documents[edit.document].find((entry) => entry.id === edit.unitId);
      if (!unit && input.documentStates && !input.evidenceUnits) throw new Error("That text part does not exist. Add it with a structural operation before editing it.");
      if (input.evidenceUnits && (edit.document !== DocumentKind.RESUME || !input.evidenceUnits.includes(edit.unitId))) continue;
      let text = input.evidenceUnits && edit.document === DocumentKind.RESUME && edit.unitId === "skills"
        ? acceptedSkills(profile, edit.skills ?? [], facts)
        : edit.text.trim();
      if (input.evidenceUnits && unit?.id === "skills" && text) {
        const parse = (value: string) => value.split("\n").flatMap((line) => skillNamesIn(line).map((name) => ({ name, group: skillLine(line).label ?? "" })));
        const next = parse(text);
        const kept = parse(unit.text).filter((skill) => !next.some((entry) => sameName(entry.name, skill.name)));
        text = skillsText([...next, ...kept]);
      }
      // Automatic evidence updates retain their narrower editing rules.
      if (unit && text !== unit.text && (!input.evidenceUnits || (text && !isVerbatimUnit(unit.id)))) {
        // E6-6: in strict mode, note what the profile and posting don't back.
        const checked = edit.document === DocumentKind.EMAIL ? unit.id !== "to" : unit.id !== SIGN_OFF_UNIT && !isFrameUnit(unit.id);
        const unverified = sources && checked ? unverifiedFacts(text, edit.document === DocumentKind.RESUME ? resumeFactSources(profile, facts) : sources) : [];
        edits.set(`${edit.document} ${unit.id}`, {
          document: edit.document,
          unitId: unit.id,
          text,
          previousText: unit.text,
          ...(unverified.length > 0 ? { unverified } : {}),
          ...(unit.unverified?.length ? { previousUnverified: unit.unverified } : {}),
        });
      }
    }
    // A new tone brings its own sign-off in English letters (APP-10).
    const signOff = letter.find((unit) => unit.id === SIGN_OFF_UNIT);
    const english = /^english$/i.test(options.language ?? extracted.language ?? "English");
    if (newTone && signOff && english && !edits.has(`${DocumentKind.COVER_LETTER} ${SIGN_OFF_UNIT}`)) {
      edits.set(`${DocumentKind.COVER_LETTER} ${SIGN_OFF_UNIT}`, {
        document: DocumentKind.COVER_LETTER,
        unitId: SIGN_OFF_UNIT,
        text: TONES[newTone].signOff,
        previousText: signOff.text,
      });
    }
  }
  return {
    data: { reply: answer.reply.trim(), edits: [...edits.values()], tone: answer.declined ? null : newTone, declined: answer.declined, ...(!input.evidenceUnits && !answer.declined && answer.operations?.length ? { operations: answer.operations } : {}) },
    promptVersion: REFINE_CHAT_VERSION,
  };
};
