import "server-only";

import { z } from "zod";

import { ChatRole, DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { AiError } from "@/lib/ai/errors";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { refineChat, type ChatTurn } from "@/lib/ai/tasks";
import { extractedOf, unitsSchema, type Unit, type UnitEdit } from "@/lib/application-data";
import { updateDocuments } from "@/lib/document-units";
import { applyDocumentOperation, validateDocumentUnits, readDocumentState, type DocumentState, type DocumentChange } from "@/lib/document-state";
import { loadDocuments, snapshotDocumentState } from "@/lib/application-documents";
import { defaultFrame } from "@/lib/letter-frame";
import { sectionLayoutSchema, sectionOfUnit } from "@/lib/resume-sections";
import { loadSettings } from "@/lib/settings-data";
import { prisma } from "@/lib/prisma";
import { profileOfApplication } from "@/lib/frozen-copy";
import { synchronizeDocumentProfile } from "@/lib/resume-fit";
import { loadThemes } from "@/lib/theme-data";
import { BUILT_IN_THEMES } from "@/lib/themes";
import { loadFactTexts } from "@/lib/profile-data";
import { unitName } from "@/lib/unit-text";

import { defineJob } from "./runner";

/** The key of an application's refine requests, to find one again after a reload. */
export const refineJobKey = (applicationId: string) => `refine:${applicationId}`;

const unitRef = z.object({ document: z.enum(DocumentKind), unitId: z.string().min(1) });

/** "A, B and C" */
const listOf = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * Answers a message in the Refine with AI panel (E8-5, APP-7, APP-9): the
 * reply, the unit edits it asks for and a new letter tone, saved together
 * with the reply. An edit only lands on a unit that still reads as the model
 * saw it; the reply mentions any it left alone.
 */
export const refineJob = defineJob({
  type: "refine",
  input: z.object({
    applicationId: z.string().min(1),
    /** The user's message, saved before the job started. */
    messageId: z.string().min(1),
    request: z.string().min(1),
    /** The unit picked with "Ask AI", if any. */
    target: unitRef.nullable(),
    /** The document on screen. */
    viewing: z.enum(DocumentKind).nullable(),
    evidence: z.object({ factId: z.string(), targetUnitId: z.string().nullable() }).optional(),
  }),
  result: z.object({
    /** The AI's reply. */
    messageId: z.string(),
    /** The units it changed, to show them. */
    edited: z.array(unitRef),
  }),
  async run({ applicationId, messageId, request, target, viewing, evidence }, { step, signal }) {
    await step("Thinking");
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { documents: true, messages: { orderBy: { createdAt: "asc" } } },
    });
    const unitsOf = (kind: DocumentKind): Unit[] => {
      const parsed = unitsSchema.safeParse(application.documents.find((document) => document.kind === kind)?.units);
      return parsed.success ? parsed.data : [];
    };
    const completed = await prisma.chatMessage.findFirst({ where: { id: `evidence-reply:${messageId}`, applicationId } });
    if (completed) return { messageId: completed.id, edited: [] };
    if (evidence && !(await prisma.fact.count({ where: { id: evidence.factId, applicationId } }))) throw AiError.config("The application evidence was removed. Add it again before rewriting.");
    const resume = unitsOf(DocumentKind.RESUME);
    const localResume = readDocumentState(application.documents.find(row => row.kind === "RESUME")?.state);
    let evidenceUnits = evidence ? ["skills", "summary", ...(evidence.targetUnitId ? [evidence.targetUnitId] : [])].filter((id) => resume.some((unit) => unit.id === id)) : undefined;
    // The letter's sender and signature hold contact details, which never go to the model (E8-11).
    const letter = unitsOf(DocumentKind.COVER_LETTER);

    // The conversation before this message.
    const index = application.messages.findIndex((message) => message.id === messageId);
    const history: ChatTurn[] = application.messages.slice(0, index < 0 ? undefined : index).map((message) =>
      message.role === ChatRole.USER
        ? { role: "user", text: message.targetUnit ? `About ${message.targetUnit}: ${message.text}` : message.text }
        : { role: "assistant", text: message.text },
    );
    const targetUnit = target && unitsOf(target.document).find((unit) => unit.id === target.unitId);

    const [provider, options, profile, facts] = await Promise.all([getAiProvider(), loadTaskOptions(), profileOfApplication(application.frozen), loadFactTexts(applicationId)]);
    const loaded = !evidence ? await loadDocuments(applicationId) : null;
    const availableThemes = !evidence ? await loadThemes() : [];
    const documentStates: Partial<Record<DocumentKind, DocumentState>> = loaded ? Object.fromEntries(application.documents.map(row => [row.kind, snapshotDocumentState(loaded, row.kind)])) : {};
    const privateFields = Object.entries(documentStates).flatMap(([document, state]) => {
      const kind = document as DocumentKind;
      const frame = defaultFrame({ basics: state!.profile.basics, company: state!.company, location: state!.location, date: new Date(state!.letterDate), dateFormat: state!.dateFormat });
      return [
        ...(["name", "email", "phone", "address", "dob", "website", "linkedin"] as const).map(field => ({ document: kind, field, value: state!.profile.basics[field] })),
        ...(["sender", "contacts", "signature"] as const).filter(() => kind === DocumentKind.COVER_LETTER).map(field => ({ document: kind, field, value: unitsOf(kind).find(unit => unit.id === field)?.text ?? frame[field] ?? "" })),
        ...(state!.includeReferences ? [{ document: kind, field: "references" as const, value: JSON.stringify(state!.profile.references) }] : []),
      ];
    });
    const evidenceSnapshot = evidence ? await prisma.fact.findUnique({ where: { id: evidence.factId } }) : null;
    if (evidenceUnits) {
      const parsed = sectionLayoutSchema.safeParse(application.sections);
      const sections = localResume?.sections ?? (parsed.success ? parsed.data : (await loadSettings()).resumeSections);
      evidenceUnits = evidenceUnits.filter((id) => !sections.off.includes(sectionOfUnit(id, localResume?.profile ?? profile) ?? ""));
    }
    const { data, promptVersion } = await refineChat(
      provider,
      {
        request,
        documentStates: loaded ? documentStates : undefined,
        themes: availableThemes,
        privateFields,
        evidenceUnits,
        evidenceFact: evidenceSnapshot?.text,
        history,
        target: targetUnit ? `${targetUnit.label} (${targetUnit.id})` : null,
        viewing,
        resume,
        letter,
        email: unitsOf(DocumentKind.EMAIL),
        profile: documentStates.RESUME?.profile ?? localResume?.profile ?? profile,
        extracted: extractedOf(application),
        tone: documentStates.COVER_LETTER?.tone ?? application.tone,
        facts,
        posting: application.postingText,
      },
      // The documents are in this language, so edits are too.
      { ...options, language: documentStates[target?.document ?? viewing ?? "RESUME"]?.language || localResume?.language || application.language || options.language, signal },
    );

    return updateDocuments(applicationId, async (documents, tx, states) => {
      if (evidence) {
        const currentFact = await tx.fact.findUnique({ where: { id: evidence.factId } });
        if (!currentFact || currentFact.applicationId !== applicationId || currentFact.text !== evidenceSnapshot?.text) throw AiError.config("The supporting evidence changed while rewriting. Try again.");
      }
      if (!evidence) {
        const touched = new Set<DocumentKind>([...data.edits.map(edit => edit.document), ...(data.operations ?? []).map(operation => operation.document), ...(data.tone ? [DocumentKind.COVER_LETTER] : [])]);
        const changes: DocumentChange[] = [];
        if ([...touched].some(kind => !documentStates[kind] || !application.documents.find(row => row.kind === kind)?.state)) {
          const current = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { sections: true, showPhoto: true, followThemeLayout: true, tone: true, language: true, frozen: true } });
          for (const key of ["sections", "showPhoto", "followThemeLayout", "tone", "language", "frozen"] as const) if (JSON.stringify(current[key]) !== JSON.stringify(application[key])) throw new Error("Application settings changed while refining. Try again.");
        }
        for (const kind of touched) {
          const row = application.documents.find(row => row.kind === kind);
          if (!row || !documents[kind] || !documentStates[kind]) throw new Error("That document no longer exists. Write it before editing.");
          const currentRow = await tx.document.findUniqueOrThrow({ where: { id: row.id }, select: { updatedAt: true, themeId: true } });
          if (currentRow.themeId !== row.themeId || currentRow.updatedAt.getTime() !== row.updatedAt.getTime()) throw new Error("The document changed while refining. Your newer edits were preserved; try again.");
          if (JSON.stringify(documents[kind]) !== JSON.stringify(unitsOf(kind)) || JSON.stringify(states[kind] ?? null) !== JSON.stringify(readDocumentState(row.state))) throw new Error("The document changed while refining. Your newer edits were preserved; try again.");
          const beforeUnits = structuredClone(documents[kind]!);
          const beforeState = structuredClone(states[kind] ?? null);
          const nextUnits = structuredClone(beforeUnits);
          let nextState = structuredClone(documentStates[kind]!);
          for (const edit of data.edits.filter(edit => edit.document === kind)) {
            const unit = nextUnits.find(unit => unit.id === edit.unitId);
            if (!unit || unit.text !== edit.previousText) throw new Error("The requested text changed. Try again.");
            unit.text = edit.text;
            if (edit.unverified?.length) unit.unverified = edit.unverified;
            else delete unit.unverified;
          }
          for (const operation of data.operations ?? []) if (operation.document === kind) nextState = applyDocumentOperation(nextState, nextUnits, operation, availableThemes.length ? availableThemes : BUILT_IN_THEMES);
          validateDocumentUnits(nextState, nextUnits, kind);
          if (data.tone && kind === DocumentKind.COVER_LETTER) nextState.tone = data.tone;
          if (JSON.stringify(nextUnits) === JSON.stringify(beforeUnits) && JSON.stringify(nextState) === JSON.stringify(documentStates[kind])) continue;
          if (kind === DocumentKind.RESUME) nextState.profile = synchronizeDocumentProfile(nextState.profile, nextUnits);
          changes.push({ document: kind, beforeUnits, afterUnits: nextUnits, beforeState, afterState: nextState });
        }
        for (const change of changes) {
          documents[change.document] = change.afterUnits;
          states[change.document] = change.afterState;
        }
        if (data.tone) await tx.application.update({ where: { id: applicationId }, data: { tone: data.tone } });
        const reply = await tx.chatMessage.create({ data: {
          id: `evidence-reply:${messageId}`, applicationId, role: ChatRole.AI,
          text: changes.length === 0 && !data.declined && (data.operations?.length || data.edits.length) ? "No document changes were applied. Please try a more specific request." : data.reply,
          ...(changes.length ? { documentChanges: changes as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue } : {}),
          ...(data.edits.length ? { edits: data.edits } : {}),
          previousTone: data.tone ? application.tone : null, writtenWith: promptVersion,
        }, select: { id: true } });
        return { messageId: reply.id, edited: changes.flatMap(change => change.afterUnits.filter(unit => change.beforeUnits.find(previous => previous.id === unit.id)?.text !== unit.text).map(unit => ({ document: change.document, unitId: unit.id }))) };
      }
      const applied: UnitEdit[] = [];
      const leftAlone: string[] = [];
      for (const edit of data.edits) {
        if (evidenceUnits && (edit.document !== DocumentKind.RESUME || !evidenceUnits.includes(edit.unitId))) continue;
        const unit = documents[edit.document]?.find((entry) => entry.id === edit.unitId);
        if (!unit) continue;
        if (unit.text !== edit.previousText) {
          leftAlone.push(`the ${unitName(unit)}`);
          continue;
        }
        unit.text = edit.text;
        if (edit.unverified?.length) unit.unverified = edit.unverified;
        else delete unit.unverified;
        applied.push(edit);
      }
      if (data.tone && !evidence) await tx.application.update({ where: { id: applicationId }, data: { tone: data.tone } });

      const note =
        leftAlone.length > 0
          ? ` I left ${listOf(leftAlone)} as ${leftAlone.length === 1 ? "it is: it" : "they are: they"} changed while I was working.`
          : "";
      const reply = await tx.chatMessage.create({
        data: {
          ...(evidence ? { id: `evidence-reply:${messageId}` } : {}),
          applicationId,
          role: ChatRole.AI,
          text: `${evidence && applied.length === 0 ? "Evidence saved, but no resume text changed. Check the visible sections or ask for a specific change." : data.reply}${note}`,
          ...(applied.length > 0 ? { edits: applied } : {}),
          previousTone: data.tone && !evidence ? application.tone : null,
          writtenWith: promptVersion,
        },
        select: { id: true },
      });
      return { messageId: reply.id, edited: applied.map(({ document, unitId }) => ({ document, unitId })) };
    }, { version: { cause: VersionCause.REFINED, detail: request } });
  },
});

export type RefineResult = z.infer<typeof refineJob.result>;
