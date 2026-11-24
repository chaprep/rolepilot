import { RESUME_STRATEGY } from "./tailor-resume";
import type { JsonCompletionRequest } from "../provider";
import { z } from "zod";

import { DocumentKind, Tone } from "@/generated/prisma/enums";
import { SIGN_OFF_UNIT, type Extracted, type Unit, type UnitEdit } from "@/lib/application-data";
import { withoutPrivateParts } from "@/lib/letter-frame";
import type { ProfileData } from "@/lib/profile";
import { TONES } from "@/lib/tones";
import { DOCUMENT_OPERATIONS, documentOperationSchema, privateFieldSchema, stateForPrompt, type DocumentOperation, type DocumentState, type PrivateField } from "@/lib/document-state";
import { THEME_FONTS, BUILT_IN_THEMES, type ThemeData } from "@/lib/themes";

import {
  applicationFacts,
  CREATIVITY,
  jobForPrompt,
  ENGLISH_WRITING,
  profileForPrompt,
  postingForPrompt,
  system,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";

export const REFINE_CHAT_VERSION = "refine-chat@17";

const answerSchema = z.object({
  reply: z.string(),
  edits: z.array(z.object({ document: z.enum(DocumentKind), unitId: z.string(), text: z.string() })),
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
  documentStates?: Partial<Record<DocumentKind, DocumentState>>;
  themes?: ThemeData[];
  privateFields?: (PrivateField & { value: string })[];
  /** Earlier messages, oldest first. */
  history: ChatTurn[];
  /** The unit the request is about, if the user picked one ("About: Summary"). */
  target: string | null;
  targetDocument?: DocumentKind;
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
  /** The posting as pasted, for job context. */
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
    task: (input.targetDocument ?? viewing) === DocumentKind.EMAIL ? "refine-email-chat" : "refine-chat",
    system: system(
      INSTRUCTIONS,
      input.documentStates && DOCUMENT_OPERATIONS,
      `Current letter tone: ${TONES[tone].label}.`,
      "Apply the user's explicit content changes to the requested application documents. Treat details and wording they supply or explicitly ask to include as authorized content, even when absent from or conflicting with their profile, remembered information or application facts. Do not require a profile update, evidence, source quotes or skill verification. Every existing text unit, including skills, certifications, publications and custom sections, is editable. For skills, return the complete replacement in text. To clear a unit, return an empty text string. Use supported structural operations to add or remove entries and sections. Preserve unrelated content and do not invent additional changes beyond the request. Ask for clarification when the request is ambiguous. Set declined to false for supported content edits; explain honestly when a request cannot be performed with the available operations. Existing context and remembered information are background, not restrictions on the user's current requested edit.",
      CREATIVITY[options.creativity],
      RESUME_STRATEGY,
      "For resume rewrites, examine actions and outcomes for transferable capabilities; preserve ownership and metrics. Apply this strategy only within the requested scope. Explicit user content edits remain authorized.",
      ENGLISH_WRITING,
      UNTRUSTED_POSTING,
      "The user's explicit wording and style requests apply within the English writing policy. Edit only the document and content requested; use the document on screen when the request does not specify one.",
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(input.documentStates ? { ...profile, basics: { ...profile.basics, name: "[private]" } } : profile)}`,
          `The job:\n${jobForPrompt(extracted, null)}`,
          `The resume's units:\n${JSON.stringify(resume, null, 2)}`,
          `The cover letter's units:\n${JSON.stringify(withoutPrivateParts(letter), null, 2)}`,
          email.length > 0 && `The email's units:\n${JSON.stringify(email, null, 2)}`,
          `Original posting (reference only; corrected job details above take precedence):\n${postingForPrompt(posting)}`,
          applicationFacts(facts),
          input.documentStates && `Current independent document inputs (use these over global defaults):\n${JSON.stringify(Object.fromEntries(Object.entries(input.documentStates).map(([kind, state]) => [kind, stateForPrompt(state!)])))}`,
          input.documentStates && `Available themes:\n${JSON.stringify(input.themes?.length ? input.themes : BUILT_IN_THEMES)}`,
          input.documentStates && `Registered fonts:\n${JSON.stringify(Object.keys(THEME_FONTS))}`,
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
  if (answer.requestedFields?.length) {
    if (!contactIntent) throw new Error("Private fields may only be read for an explicit header, contact or signature request.");
    const requested = answer.requestedFields.map(field => input.privateFields?.find(value => value.document === field.document && value.field === field.field)).filter(value => value !== undefined);
    if (requested.length !== answer.requestedFields.length) throw new Error("The requested private field is unavailable in this document.");
    answer = await provider.complete<z.infer<typeof answerSchema>>({ ...completion, messages: [...completion.messages, { role: "assistant", content: JSON.stringify(answer) }, { role: "user", content: `Only the requested displayed fields for this edit:\n${JSON.stringify(requested)}\nReturn final operations/edits now; do not request more fields.` }] });
    contactIntent ||= Boolean(answer.privateEditsRequested);
    if (answer.requestedFields?.length) throw new Error("The requested edit could not be completed with the scoped fields.");
  }

  if (!contactIntent && answer.operations?.some(operation => operation.type === "metadata" && /^(basics\.(name|email|phone|address|dob|website|linkedin)|references\.)/.test(operation.path) || operation.type === "unit" && ["sender", "contacts", "signature"].includes(operation.id) || operation.type === "entry" && operation.collection === "references")) throw new Error("Contact edits require an explicit contact request.");
  const newTone = answer.tone && answer.tone !== tone ? answer.tone : null;
  const documents = { [DocumentKind.RESUME]: resume, [DocumentKind.COVER_LETTER]: letter, [DocumentKind.EMAIL]: email };
  // Only units that exist, each once; the text they replace is kept for Undo (APP-8).
  const edits = new Map<string, UnitEdit>();
  if (!answer.declined) {
    for (const edit of answer.edits) {
      if (edit.document === DocumentKind.COVER_LETTER && ["sender", "contacts", "signature"].includes(edit.unitId) && !contactIntent) continue;
      const unit = documents[edit.document].find((entry) => entry.id === edit.unitId);
      if (!unit && input.documentStates) throw new Error("That text part does not exist. Add it with a structural operation before editing it.");
      const text = edit.text.trim();
      if (unit && text !== unit.text) {
        edits.set(`${edit.document} ${unit.id}`, {
          document: edit.document,
          unitId: unit.id,
          text,
          previousText: unit.text,
          ...(unit.unverified?.length ? { previousUnverified: unit.unverified } : {}),
        });
      }
    }
    // A new tone brings its own sign-off in English letters (APP-10).
    const signOff = letter.find((unit) => unit.id === SIGN_OFF_UNIT);
    if (newTone && signOff && !edits.has(`${DocumentKind.COVER_LETTER} ${SIGN_OFF_UNIT}`)) {
      edits.set(`${DocumentKind.COVER_LETTER} ${SIGN_OFF_UNIT}`, {
        document: DocumentKind.COVER_LETTER,
        unitId: SIGN_OFF_UNIT,
        text: TONES[newTone].signOff,
        previousText: signOff.text,
      });
    }
  }
  return {
    data: { reply: answer.reply.trim(), edits: [...edits.values()], tone: answer.declined ? null : newTone, declined: answer.declined, ...(!answer.declined && answer.operations?.length ? { operations: answer.operations } : {}) },
    promptVersion: REFINE_CHAT_VERSION,
  };
};
