import { prepareCandidateProfile, assertCandidateContext } from "@/lib/memory/context";
import "server-only";

import { researchForEdits } from "@/lib/research/application";

import { z } from "zod";

import { ChatRole, DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { AiError } from "@/lib/ai/errors";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { refineChat, type ChatTurn } from "@/lib/ai/tasks";
import { extractedOf, unitsSchema, type Unit } from "@/lib/application-data";
import { updateDocuments } from "@/lib/document-units";
import { applyDocumentOperation, validateDocumentUnits, readDocumentState, type DocumentState, type DocumentChange } from "@/lib/document-state";
import { loadDocuments, snapshotDocumentState } from "@/lib/application-documents";
import { defaultFrame } from "@/lib/letter-frame";
import { prisma } from "@/lib/prisma";
import { profileOfApplication } from "@/lib/frozen-copy";
import { synchronizeDocumentProfile } from "@/lib/resume-fit";
import { loadThemes } from "@/lib/theme-data";
import { BUILT_IN_THEMES } from "@/lib/themes";
import { loadFactTexts } from "@/lib/profile-data";

import { defineJob } from "./runner";

/** The key of an application's refine requests, to find one again after a reload. */
export const refineJobKey = (applicationId: string) => `refine:${applicationId}`;

const unitRef = z.object({ document: z.enum(DocumentKind), unitId: z.string().min(1) });

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
    // Keep legacy input explicit so old queued jobs cannot become unrestricted edits.
    evidence: z.object({ factId: z.string(), targetUnitId: z.string().nullable() }).optional(),
  }),
  result: z.object({
    /** The AI's reply. */
    messageId: z.string(),
    /** The units it changed, to show them. */
    edited: z.array(unitRef),
  }),
  async run({ applicationId, messageId, request, target, viewing, evidence }, { step, signal }) {
    if (evidence) throw AiError.config("Automatic evidence updates are no longer supported. Your information is saved; request the desired change in Refine with AI.");
    await step("Thinking");
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { startup: { select: { website: true } }, documents: true, messages: { orderBy: { createdAt: "asc" } } },
    });
    const unitsOf = (kind: DocumentKind): Unit[] => {
      const parsed = unitsSchema.safeParse(application.documents.find((document) => document.kind === kind)?.units);
      return parsed.success ? parsed.data : [];
    };
    const completed = await prisma.chatMessage.findFirst({ where: { id: `evidence-reply:${messageId}`, applicationId } });
    if (completed) return { messageId: completed.id, edited: [] };
    const resume = unitsOf(DocumentKind.RESUME);
    const localResume = readDocumentState(application.documents.find(row => row.kind === "RESUME")?.state);
    // Chat supplies contact fields only when an explicit edit needs them.
    const letter = unitsOf(DocumentKind.COVER_LETTER);

    // The conversation before this message.
    const index = application.messages.findIndex((message) => message.id === messageId);
    const history: ChatTurn[] = application.messages.slice(0, index < 0 ? undefined : index).map((message) =>
      message.role === ChatRole.USER
        ? { role: "user", text: message.targetUnit ? `About ${message.targetUnit}: ${message.text}` : message.text }
        : { role: "assistant", text: message.text },
    );
    const targetUnit = target && unitsOf(target.document).find((unit) => unit.id === target.unitId);

    const [provider, options, profile] = await Promise.all([getAiProvider(), loadTaskOptions(), profileOfApplication(application.frozen)]);
    const loaded = await loadDocuments(applicationId);
    const availableThemes = await loadThemes();
    const documentStates: Partial<Record<DocumentKind, DocumentState>> = Object.fromEntries(application.documents.map(row => [row.kind, snapshotDocumentState(loaded, row.kind)]));
    const privateFields = Object.entries(documentStates).flatMap(([document, state]) => {
      const kind = document as DocumentKind;
      const frame = defaultFrame({ basics: state!.profile.basics, company: state!.company, location: state!.location, date: new Date(state!.letterDate), dateFormat: state!.dateFormat });
      return [
        ...(["name", "email", "phone", "address", "dob", "website", "linkedin"] as const).map(field => ({ document: kind, field, value: state!.profile.basics[field] })),
        ...(["sender", "contacts", "signature"] as const).filter(() => kind === DocumentKind.COVER_LETTER).map(field => ({ document: kind, field, value: unitsOf(kind).find(unit => unit.id === field)?.text ?? frame[field] ?? "" })),
        ...(state!.includeReferences ? [{ document: kind, field: "references" as const, value: JSON.stringify(state!.profile.references) }] : []),
      ];
    });
    const candidate = await prepareCandidateProfile(documentStates.RESUME?.profile ?? localResume?.profile ?? profile, application.postingText, signal, provider, { processPending: false });
    const { data, promptVersion } = await refineChat(
      provider,
      {
        request,
        documentStates,
        themes: availableThemes,
        privateFields,
        history,
        target: targetUnit ? `${targetUnit.label} (${targetUnit.id})` : null,
        viewing,
        resume,
        letter,
        email: unitsOf(DocumentKind.EMAIL),
        profile: candidate,
        extracted: extractedOf(application),
        tone: documentStates.COVER_LETTER?.tone ?? application.tone,
        facts: await loadFactTexts(applicationId),
        posting: application.postingText,
        companyResearch: researchForEdits(application),
      },
      // Requested text is English; partial edits retain historical document metadata.
      { ...options, signal },
    );

    return updateDocuments(applicationId, async (documents, tx, states) => {
      await assertCandidateContext(candidate, tx);
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
        const prose = beforeUnits.filter(unit => unit.text.trim() && /^(summary|skills|languages|experience:|project:|education:|paragraph:|greeting$|recipient$|sign-off$|subject$|body$)/.test(unit.id));
        const rewriteRequested = /\b(rewrite|regenerate|translate|retailor|tailor|optimi[sz]e|improve|English)\b/i.test(request);
        if (rewriteRequested && prose.length && prose.every(unit => nextUnits.find(next => next.id === unit.id)?.text !== unit.text)) {
          nextState.language = "English";
          if (kind === DocumentKind.COVER_LETTER) {
            const date = nextUnits.find(unit => unit.id === "date");
            if (date) date.text = defaultFrame({ basics: nextState.profile.basics, company: nextState.company, location: nextState.location, date: new Date(nextState.letterDate), dateFormat: nextState.dateFormat }).date;
          }
        }
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
    }, { version: { cause: VersionCause.REFINED, detail: request } });
  },
});

export type RefineResult = z.infer<typeof refineJob.result>;
