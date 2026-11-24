"use server";

import { randomUUID } from "node:crypto";
import { recordMemorySource } from "@/lib/memory/store";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { ChatRole, DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { isAiConfigured } from "@/lib/ai/config";
import { profileUnits } from "@/lib/ai/tasks/tailor-resume";
import { editsSchema, trimmedSchema, unitsSchema, applicationEvidenceSchema, applicationEvidenceText, evidenceOptions } from "@/lib/application-data";
import { loadDocuments, snapshotDocumentState, readJson } from "@/lib/application-documents";
import { WRITTEN_EMAIL_UNITS } from "@/lib/application-email";
import { applyDocumentOperation, documentChangesSchema, documentStateSchema, readDocumentState, type DocumentState } from "@/lib/document-state";
import { coverLetterLayoutSchema } from "@/lib/cover-letter-format";
import { documentLabels } from "@/lib/document-labels";
import { frozenCopySchema, frozenProfile, readFrozenCopy, withSectionFromProfile } from "@/lib/frozen-copy";
import { updateDocuments } from "@/lib/document-units";
import { DOCUMENT_LABELS } from "@/lib/file-name";
import { syncInterviewToCalendar } from "@/lib/google/availability";
import { GoogleError } from "@/lib/google/errors";
import { isFrameUnit, withFrame, WRITTEN_FRAME_UNITS } from "@/lib/letter-frame";
import { saveVersion } from "@/lib/document-versions";
import { refineJob, refineJobKey } from "@/lib/jobs/refine";
import { regenerateUnitJob, unitJobKey } from "@/lib/jobs/regenerate-unit";
import { findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { emailJobKey, writeEmailJob } from "@/lib/jobs/write-email";
import { writeDocumentJob, writeDocumentJobKey } from "@/lib/jobs/write-document";
import { scoreResumeJob, scoreResumeJobKey } from "@/lib/jobs/score-resume";
import { scoringProblem } from "@/lib/scoring";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { nextSort } from "@/lib/profile-entries";
import { profileUpdate } from "@/lib/profile-update";
import { sectionLayoutSchema, sectionOfUnit, withoutSectionsOff } from "@/lib/resume-sections";
import { loadSettings } from "@/lib/settings-data";
import { themeFieldsSchema } from "@/lib/theme-file";
import type { ThemeData } from "@/lib/themes";
import { THEME_FIELDS } from "@/lib/theme-data";
import { cleanUnitText, isPublicationUnit, isVerbatimUnit, unitName } from "@/lib/unit-text";

const GONE = "That application no longer exists.";
const PART_GONE = "That part of the document no longer exists. Reload the page to see what's there now.";

const refresh = (id: string) => revalidatePath(`/applications/${id}`);

async function updateLocalResume(id: string, change: (state: DocumentState) => void) {
  await updateDocuments(id, async (_documents, _tx, states) => { if (states.RESUME) change(states.RESUME); });
}

/** The Resume tab's layout switch (APP-4): the theme's own layout, or a single column. */
export const setFollowThemeLayout = action(
  z.object({ id: z.string().min(1), follow: z.boolean() }),
  async ({ id, follow }) => {
    const { count } = await prisma.application.updateMany({ where: { id }, data: { followThemeLayout: follow } });
    await updateLocalResume(id, state => { state.followThemeLayout = follow; });
    if (count === 0) throw new ActionError(GONE);
    refresh(id);
    return null;
  },
);

/** The Resume tab's Photo switch (#224): show the profile photo on this resume or not, whatever the profile says. */
export const setShowPhoto = action(z.object({ id: z.string().min(1), show: z.boolean() }), async ({ id, show }) => {
  const { count } = await prisma.application.updateMany({ where: { id }, data: { showPhoto: show } });
  await updateLocalResume(id, state => { state.showPhoto = show; });
  if (count === 0) throw new ActionError(GONE);
  refresh(id);
  return null;
});

/** The Sections menu (#297): this resume's own order and which sections are on it. */
export const setApplicationSections = action(z.object({ id: z.string().min(1), order: sectionLayoutSchema.shape.order, off: sectionLayoutSchema.shape.off, titles: sectionLayoutSchema.shape.titles }), async ({ id, order, off, titles }) => {
  const application = await prisma.application.findUnique({ where: { id }, select: { sections: true } });
  if (!application) throw new ActionError(GONE);
  const withReferences = readJson(sectionLayoutSchema, application.sections)?.withReferences;
  await prisma.application.update({ where: { id }, data: { sections: { order, off, ...(titles ? { titles } : {}), ...(withReferences ? { withReferences } : {}) } } });
  await updateLocalResume(id, state => { state.sections = { ...state.sections, order, off, titles }; });
  refresh(id);
  return null;
});

/** "Use the base resume's order": a draft follows the base resume again; one that was sent takes its order as it is now, once. */
export const followBaseSections = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const application = await prisma.application.findUnique({ where: { id }, select: { frozen: true } });
  if (!application) throw new ActionError(GONE);
  const baseSections = (await loadSettings()).resumeSections;
  const sections = application.frozen === null ? Prisma.DbNull : baseSections;
  await prisma.application.update({ where: { id }, data: { sections } });
  await updateLocalResume(id, state => { state.sections = baseSections; });
  refresh(id);
  return null;
});

/**
 * "Add" on the Sections menu (#297): puts a section from the profile on this
 * resume, in the profile's own words. Nothing else ever does: a resume only
 * holds what it was written with and what's added here.
 */
export const addApplicationSection = action(z.object({ id: z.string().min(1), key: z.string().min(1) }), async ({ id, key }) => {
  const [application, profile, settings] = await Promise.all([
    prisma.application.findUnique({ where: { id }, select: { sections: true, language: true, frozen: true } }),
    loadProfile(),
    loadSettings(),
  ]);
  if (!application) throw new ActionError(GONE);

  const fresh = profileUnits(profile, documentLabels(application.language)).filter((unit) => sectionOfUnit(unit.id, profile) === key);
  const added = new Set(fresh.map((unit) => unit.id));
  const copy = readFrozenCopy(application.frozen);
  await updateDocuments(id, async (documents, tx, states) => {
    const local = states.RESUME;
    if (local) {
      // Import only the explicitly selected section; keep other local entries and metadata.
      const merged = withSectionFromProfile({ profile: local.profile, themes: { RESUME: local.theme, COVER_LETTER: local.theme }, paper: local.paper, dateFormat: local.dateFormat, includeReferences: local.includeReferences, followedBase: false }, profile, key);
      local.profile = { ...merged.profile, photo: local.profile.photo };
      local.sections.off = local.sections.off.filter(entry => entry !== key);
      if (!local.sections.order.includes(key)) local.sections.order.push(key);
      if (key === "references") local.includeReferences = true;
    }
    const units = documents[DocumentKind.RESUME];
    if (!units) throw new ActionError(PART_GONE);
    // A sent resume is drawn from its copy, so the section has to reach that too (#299). Taking one back on that it still holds changes nothing.
    const holdsIt = copy !== null && units.some((unit) => unit.text.trim() && sectionOfUnit(unit.id, frozenProfile(copy, profile)) === key);
    if (copy && !holdsIt) {
      await tx.application.update({ where: { id }, data: { frozen: withSectionFromProfile(copy, profile, key) as unknown as Prisma.InputJsonValue } });
    }
    for (const unit of fresh) {
      const index = units.findIndex((entry) => entry.id === unit.id);
      if (index < 0) units.push(unit);
      else if (!units[index].text.trim()) units[index] = unit;
    }
  });
  // Back through here, so they're no longer listed as left out. Written after the document itself: updateDocuments checks it wasn't changed meanwhile.
  const row = await prisma.document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: id, kind: DocumentKind.RESUME } }, select: { id: true, trimmed: true } });
  const trimmed = readJson(trimmedSchema, row.trimmed);
  const rest = trimmed?.filter((cut) => !(cut.kind === "unit" ? added.has(cut.unit.id) : added.has(cut.unitId)));
  if (trimmed && rest && rest.length !== trimmed.length) {
    await prisma.document.update({ where: { id: row.id }, data: { trimmed: rest.length > 0 ? rest : Prisma.DbNull } });
  }

  const own = readJson(sectionLayoutSchema, application.sections);
  const layout = own ?? settings.resumeSections;
  if (layout.off.includes(key) || key === "references") {
    await prisma.application.update({
      where: { id },
      data: {
        sections: {
          ...layout,
          off: layout.off.filter((entry) => entry !== key),
          ...(key === "references" ? { withReferences: true } : {}),
        },
      },
    });
  }
  refresh(id);
  return null;
});

/**
 * "Update from profile" (#301): titles, dates, contact details and links as
 * the profile has them now, with what's new in the sections this resume holds.
 * Returns what to put back for Undo, or null when there was nothing to update.
 */
export const updateFromProfile = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError(GONE);
  const { application, liveProfile, resume, includeReferences } = await loadDocuments(id);
  if (!resume) throw new ActionError(PART_GONE);
  const copy = readFrozenCopy(application.frozen);
  const update = profileUpdate({ copy: resume.state?.profile ?? copy?.profile ?? null, live: liveProfile, units: resume.units, trimmed: resume.trimmed ?? null, language: application.language, includeReferences });
  if (!update.changed) return null;

  await updateDocuments(id, async (documents, tx, states) => {
    documents[DocumentKind.RESUME] = update.units;
    if (states.RESUME && update.copy) states.RESUME.profile = { ...update.copy, photo: states.RESUME.profile.photo, facts: [] };
    if (copy && update.copy) await tx.application.update({ where: { id }, data: { frozen: { ...copy, profile: update.copy } as unknown as Prisma.InputJsonValue } });
  });
  refresh(id);
  return { profile: copy?.profile ?? null, units: resume.units, ...(resume.state ? { state: resume.state } : {}) };
});

/** Undo after "Update from profile". */
export const undoUpdateFromProfile = action(
  z.object({ id: z.string().min(1), profile: frozenCopySchema.shape.profile.nullable(), units: unitsSchema, state: documentStateSchema.nullable().optional() }),
  async ({ id, profile, units, state }) => {
    const application = await prisma.application.findUnique({ where: { id }, select: { frozen: true } });
    if (!application) throw new ActionError(GONE);
    const copy = readFrozenCopy(application.frozen);
    await updateDocuments(id, async (documents, tx, states) => {
      documents[DocumentKind.RESUME] = units;
      if (state !== undefined) states.RESUME = state;
      if (copy && profile) await tx.application.update({ where: { id }, data: { frozen: { ...copy, profile } as unknown as Prisma.InputJsonValue } });
    });
    refresh(id);
    return null;
  },
);

/** Format selection is a local document edit, with the same history and Undo as refinement. */
export const setCoverLetterLayout = action(z.object({ id: z.string().min(1), layout: coverLetterLayoutSchema }), async ({ id, layout }) => {
  const loaded = await loadDocuments(id);
  if (!loaded.letter) throw new ActionError("Write the cover letter before choosing a format.");
  const letter = loaded.letter;
  if ((letter.state?.coverLetterLayout ?? letter.initialLetterLayout ?? "CLASSIC") === layout) return null;
  const seed = snapshotDocumentState(loaded, DocumentKind.COVER_LETTER);
  await updateDocuments(id, async (documents, tx, states) => {
    const current = documents.COVER_LETTER;
    const row = loaded.application.documents.find(document => document.kind === "COVER_LETTER")!;
    const fresh = await tx.document.findUniqueOrThrow({ where: { id: row.id }, select: { updatedAt: true, themeId: true } });
    if (!current || JSON.stringify(current) !== JSON.stringify(letter.units) || JSON.stringify(states.COVER_LETTER ?? null) !== JSON.stringify(letter.state ?? null) || fresh.updatedAt.getTime() !== row.updatedAt.getTime() || fresh.themeId !== row.themeId) throw new ActionError("The letter changed while selecting its format. Try again.");
    const nextUnits = structuredClone(current);
    const nextState = applyDocumentOperation(seed, nextUnits, { type: "settings", document: "COVER_LETTER", json: JSON.stringify({ coverLetterLayout: layout }) });
    await tx.chatMessage.create({ data: { applicationId: id, role: "AI", text: `Changed the cover-letter format to ${layout === "SIDEBAR" ? "Sidebar" : "Classic"}.`, writtenWith: "letter-format@1", documentChanges: [{ document: "COVER_LETTER", beforeUnits: current, afterUnits: nextUnits, beforeState: states.COVER_LETTER ?? null, afterState: nextState }] as unknown as Prisma.InputJsonValue } });
    documents.COVER_LETTER = nextUnits;
    states.COVER_LETTER = nextState;
  }, { version: { cause: VersionCause.REFINED, detail: `Cover-letter format: ${layout === "SIDEBAR" ? "Sidebar" : "Classic"}` } });
  refresh(id);
  return null;
});

/**
 * The Theme menu on the Resume and Cover letter tabs (#226, public issue 10):
 * gives the application's resume and cover letter another theme, together.
 * Only their look changes, so nothing is written again.
 */
async function applyApplicationTheme(id: string, choice: string | z.infer<typeof themeFieldsSchema>) {
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError(GONE);
  const loaded = await loadDocuments(id);
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id }, select: { frozen: true } });
    if (!application) throw new ActionError(GONE);
    const selected = typeof choice === "string"
      ? await tx.theme.findUnique({ where: { id: choice }, select: THEME_FIELDS })
      : await tx.theme.create({ data: choice, select: THEME_FIELDS });
    if (!selected) throw new ActionError("That theme doesn't exist anymore. Reload the page to see your themes.");
    const themeId = selected.id;
    const letterSeed = loaded.letter?.initialLetterLayout === "SIDEBAR" && !loaded.letter.state ? snapshotDocumentState(loaded, DocumentKind.COVER_LETTER) : null;
    await tx.document.updateMany({
      where: { applicationId: id, kind: { in: [DocumentKind.RESUME, DocumentKind.COVER_LETTER] } },
      data: { themeId },
    });
    const selectedTheme = selected;
    await updateDocuments(id, async (_documents, _tx, states) => {
      if (!states.COVER_LETTER && letterSeed) states.COVER_LETTER = letterSeed;
      for (const kind of [DocumentKind.RESUME, DocumentKind.COVER_LETTER]) if (states[kind]) {
        states[kind]!.theme = selectedTheme;
        states[kind]!.styles = {};
      }
    }, { transaction: tx });
    // A sent resume is drawn in the theme it was sent with, until it's given another here (#299).
    const copy = readFrozenCopy(application.frozen);
    if (copy) {
      const theme = selected;
      await tx.application.update({ where: { id }, data: { frozen: { ...copy, themes: { RESUME: theme, COVER_LETTER: theme } } as unknown as Prisma.InputJsonValue } });
    }
    return selected;
  });
}

export const setApplicationTheme = action(z.object({ id: z.string().min(1), themeId: z.string().min(1) }), async ({ id, themeId }) => {
  await applyApplicationTheme(id, themeId);
  refresh(id);
  return null;
});

/** Save a new library theme and apply it here without changing the base theme. */
export const saveApplicationTheme = action(
  themeFieldsSchema.extend({ applicationId: z.string().min(1) }),
  async ({ applicationId, ...fields }, { toast }): Promise<ThemeData> => {
    const theme = await applyApplicationTheme(applicationId, fields);
    toast(`Saved “${theme.name}” for this application.`);
    refresh(applicationId);
    revalidatePath("/resume");
    return theme;
  },
);


/**
 * The next interview's date and time (E9-9), or null to remove it. It shows
 * on the dashboard's "Worth a look" while the application is in Interview,
 * and while rolepilot keeps interviews in Google Calendar, the event is added,
 * moved or deleted to match.
 */
export const setInterviewDate = action(
  z.object({ id: z.string().min(1), at: z.iso.datetime().nullable() }),
  async ({ id, at }, { toast }) => {
    const { count } = await prisma.application.updateMany({ where: { id }, data: { nextInterviewAt: at ? new Date(at) : null } });
    if (count === 0) throw new ActionError(GONE);
    refresh(id);
    try {
      const { inCalendar } = await syncInterviewToCalendar(id);
      if (inCalendar) toast(at ? "Interview date saved, in your calendar too." : "Interview date removed, from your calendar too.");
      else toast(at ? "Interview date saved. It'll show on your dashboard." : "Interview date removed.");
    } catch (error) {
      if (!(error instanceof GoogleError)) throw error;
      toast(`${at ? "Interview date saved" : "Interview date removed"}, but your calendar wasn't changed: ${error.message}`);
    }
    return null;
  },
);

/**
 * Saves a unit edited by hand (APP-6). `expected` is the text the editor
 * started from: if the unit changed since (an AI rewrite that finished
 * meanwhile), nothing is saved, so neither version is lost unseen. The
 * text is the user's own, so the fact guard's hints go.
 */
export const saveUnit = action(
  z.object({
    id: z.string().min(1),
    document: z.enum(DocumentKind),
    unitId: z.string().min(1),
    text: z.string().max(10_000),
    expected: z.string(),
  }),
  async ({ id, document, unitId, text, expected }) => {
    const clean = cleanUnitText(unitId, text);
    // The email's recipient may be left empty, for the mail app to fill in.
    if (!clean && !(document === DocumentKind.EMAIL && unitId === "to")) {
      throw new ActionError("Write something first, or cancel to keep it as it was.");
    }

    await updateDocuments(id, async (documents, tx) => {
      const units = documents[document];
      const unit = units?.find((entry) => entry.id === unitId);
      // A letter written before E8-11 shows its frame without storing it: the first edit stores that part.
      if (!unit && units && document === DocumentKind.COVER_LETTER && isFrameUnit(unitId)) {
        documents[document] = withFrame(units, { [unitId]: clean });
        return;
      }
      if (!unit) throw new ActionError(PART_GONE);
      if (unit.text !== expected) {
        throw new ActionError("This part changed while you were editing it. Copy your text, cancel, and edit the new version.");
      }
      if (unit.text !== clean && !["to", "sender", "contacts", "signature", "date", "recipient", "greeting"].includes(unitId)) {
        const row = await tx.document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: id, kind: document } }, select: { id: true } });
        await recordMemorySource(tx, { sourceKey: `edit:${randomUUID()}`, kind: "MANUAL_EDIT", text: clean, previousText: unit.text, applicationId: id, documentId: row.id, context: { unitId, scope: "UNRESOLVED", label: unit.label } });
      }
      unit.text = clean;
      delete unit.unverified;
    });
    refresh(id);
    return { text: clean };
  },
);

const unitInput = { id: z.string().min(1), document: z.enum(DocumentKind), unitId: z.string().min(1) };

/**
 * "Regenerate" (E8-4): rewrites one unit in the background and returns the
 * job's id. Asking again while it's being rewritten follows the same job.
 */
export const startRegenerating = action(
  z.object({
    ...unitInput,
    /** For a letter part an older letter only shows (E8-11): the text on screen, stored before it's rewritten. */
    shown: z.string().trim().min(1).max(2000).optional(),
  }),
  async ({ id, document, unitId, shown }) => {
    const frame = document === DocumentKind.COVER_LETTER && isFrameUnit(unitId);
    // The sender, date and signature come from the profile and the day, not the AI (E8-11).
    if ((frame && !WRITTEN_FRAME_UNITS.has(unitId)) || (document === DocumentKind.EMAIL && !WRITTEN_EMAIL_UNITS.has(unitId))) {
      throw new ActionError("This part isn't written by the AI. Edit it instead.");
    }
    // A certification or publication is the user's own (#293, #218).
    if (document === DocumentKind.RESUME && isVerbatimUnit(unitId)) {
      throw new ActionError(`A ${isPublicationUnit(unitId) ? "publication" : "certification"} stays as you wrote it. Edit it instead.`);
    }
    if (frame && shown) {
      await updateDocuments(id, async (documents) => {
        const units = documents[document];
        if (units && !units.some((entry) => entry.id === unitId)) documents[document] = withFrame(units, { [unitId]: shown });
      });
    }
    const row = await prisma.document.findUnique({ where: { applicationId_kind: { applicationId: id, kind: document } } });
    const unit = row && unitsSchema.parse(row.units).find((entry) => entry.id === unitId);
    if (!unit) throw new ActionError(PART_GONE);

    for (const job of await findUnfinishedJobs(unitJobKey(id))) {
      const input = regenerateUnitJob.input.safeParse(job.input);
      if (input.success && input.data.document === document && input.data.unitId === unitId) return job.id;
    }
    return startJob(regenerateUnitJob, { applicationId: id, document, unitId, from: unit.text }, { key: unitJobKey(id), applicationId: id });
  },
);

/**
 * Undo on the "Rewrote the summary." toast (E8-4): puts the previous
 * version back, unless the unit has changed again since.
 */
export const restoreUnit = action(
  z.object({
    ...unitInput,
    text: z.string().max(10_000),
    unverified: z.array(z.string()).optional(),
    /** The text it has now, which Undo replaces. */
    expected: z.string(),
  }),
  async ({ id, document, unitId, text, unverified, expected }) => {
    await updateDocuments(id, async (documents) => {
      const unit = documents[document]?.find((entry) => entry.id === unitId);
      if (!unit) throw new ActionError(PART_GONE);
      if (unit.text !== expected) throw new ActionError("It's been changed again since, so this can't be undone.");
      unit.text = text;
      if (unverified?.length) unit.unverified = unverified;
      else delete unit.unverified;
    }, { version: { cause: VersionCause.UNDONE } });
    refresh(id);
    return null;
  },
);

/** The answer on the Job posting tab, where there's nothing to change. */
const POSTING_REPLY = "I can change the resume, the cover letter or the email. Switch to one of them, or hover a section and pick “Ask AI”.";

/**
 * Sends a message from the Refine with AI panel (E8-5): saves it and starts
 * the reply in the background, returning the job's id. On the Job posting
 * tab without a picked unit, the reply comes at once and needs no AI.
 */
export const sendMessage = action(
  z.object({
    id: z.string().min(1),
    text: z.string().trim().min(1, "Write what should change first.").max(2000),
    /** The document on screen; null on the Job posting and Notes tabs, and on the Email tab before there's an email. */
    viewing: z.enum(DocumentKind).nullable(),
    /** The unit picked with "Ask AI". */
    target: z.object({ document: z.enum(DocumentKind), unitId: z.string().min(1) }).nullable(),
  }),
  async ({ id, text, viewing, target }) => {
    if (!(await prisma.application.count({ where: { id } }))) throw new ActionError(GONE);

    const aiConfigured = await isAiConfigured();
    if ((!viewing && !target) || !aiConfigured) {
      const now = Date.now();
      await prisma.$transaction(async tx => {
      const messageId = randomUUID();
      await tx.chatMessage.createMany({
        data: [
          { id: messageId, applicationId: id, role: ChatRole.USER, text, createdAt: new Date(now) },
          { applicationId: id, role: ChatRole.AI, text: (!viewing && !target) ? POSTING_REPLY : "Your information was saved for automatic memory processing. Configure an AI provider to process it and edit documents.", createdAt: new Date(now + 1) },
        ],
      });
      await recordMemorySource(tx, { sourceKey: `message:${messageId}`, kind: "CHAT", text, applicationId: id, messageId, context: { scope: "UNRESOLVED" } });
      });
      refresh(id);
      return { jobId: null };
    }

    if (!(await isAiConfigured())) throw new ActionError("That needs an AI provider. Choose one in Settings → AI provider.");
    if ((await findUnfinishedJobs(refineJobKey(id))).length > 0) {
      throw new ActionError("I'm still working on your last message. Send this one when I'm done.");
    }
    let targetLabel: string | null = null;
    if (target) {
      const row = await prisma.document.findUnique({ where: { applicationId_kind: { applicationId: id, kind: target.document } } });
      const unit = row && unitsSchema.parse(row.units).find((entry) => entry.id === target.unitId);
      if (!unit) throw new ActionError(PART_GONE);
      targetLabel = unit.label;
    }

    const message = await prisma.$transaction(async tx => {
      const message = await tx.chatMessage.create({ data: { applicationId: id, role: ChatRole.USER, text, targetUnit: targetLabel }, select: { id: true } });
      await recordMemorySource(tx, { sourceKey: `message:${message.id}`, kind: "CHAT", text, applicationId: id, messageId: message.id, context: { scope: "UNRESOLVED", unitId: target?.unitId ?? null, label: targetLabel ?? "" } });
      return message;
    });
    const jobId = await startJob(refineJob, { applicationId: id, messageId: message.id, request: text, target, viewing }, { key: refineJobKey(id), applicationId: id });
    refresh(id);
    return { jobId };
  },
);

/** "A, B and C" */
const listOf = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * "Undo" under a reply in the chat (E8-6, APP-8): puts back what the reply
 * changed, units and tone, all or nothing. A unit edited again since is
 * never overwritten; the answer says which.
 */
export const undoMessage = action(z.object({ id: z.string().min(1), messageId: z.string().min(1) }), async ({ id, messageId }) => {
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, applicationId: id, role: ChatRole.AI } });
  const complete = message?.documentChanges ? documentChangesSchema.parse(message.documentChanges) : [];
  if (message && complete.length) {
    if (message.undone) throw new ActionError("That's already undone.");
    await updateDocuments(id, async (documents, tx, states) => {
      for (const change of complete) {
        if (JSON.stringify(documents[change.document]) !== JSON.stringify(change.afterUnits) || JSON.stringify(states[change.document] ?? null) !== JSON.stringify(change.afterState)) throw new ActionError("This document changed since. Undo would overwrite newer edits; use its history instead.");
      }
      for (const change of complete) {
        documents[change.document] = change.beforeUnits;
        states[change.document] = change.beforeState;
      }
      if (message.previousTone) await tx.application.update({ where: { id }, data: { tone: message.previousTone } });
      const { count } = await tx.chatMessage.updateMany({ where: { id: messageId, undone: false }, data: { undone: true } });
      if (!count) throw new ActionError("That's already undone.");
    }, { version: { cause: VersionCause.UNDONE } });
    refresh(id);
    return { edited: complete.flatMap(change => change.beforeUnits.map(unit => ({ document: change.document, unitId: unit.id }))) };
  }
  const edits = message && editsSchema.safeParse(message.edits);
  if (!message || !edits?.success || edits.data.length === 0) throw new ActionError("There's nothing to undo in that message.");
  if (message.undone) throw new ActionError("That's already undone.");

  await updateDocuments(id, async (documents, tx) => {
    const changed = edits.data.flatMap((edit) => {
      const unit = documents[edit.document]?.find((entry) => entry.id === edit.unitId);
      return unit?.text === edit.text ? [] : [`the ${unitName(unit ?? { id: edit.unitId, label: "" })}`];
    });
    if (changed.length > 0) {
      throw new ActionError(
        `You've changed ${listOf(changed)} since, so undoing this would overwrite that. Edit ${changed.length === 1 ? "it" : "them"} by hand instead.`,
      );
    }
    for (const edit of edits.data) {
      const unit = documents[edit.document]!.find((entry) => entry.id === edit.unitId)!;
      unit.text = edit.previousText;
      if (edit.previousUnverified?.length) unit.unverified = edit.previousUnverified;
      else delete unit.unverified;
    }
    if (message.previousTone) await tx.application.update({ where: { id }, data: { tone: message.previousTone } });
    // Only once, even when two clicks race.
    const { count } = await tx.chatMessage.updateMany({ where: { id: messageId, undone: false }, data: { undone: true } });
    if (count === 0) throw new ActionError("That's already undone.");
  }, { version: { cause: VersionCause.UNDONE } });
  refresh(id);
  return { edited: edits.data.map(({ document, unitId }) => ({ document, unitId })) };
});

/** Evidence belongs to the application; no profile write occurs here. */
export const addApplicationEvidence = action(z.object({ id: z.string().min(1), evidence: applicationEvidenceSchema }), async ({ id, evidence }) => {
  const loaded = await loadDocuments(id);
  const requirement = loaded.extracted?.requirements[evidence.requirementIndex];
  const options = evidenceOptions(withoutSectionsOff(loaded.resume?.state?.profile ?? loaded.profile, loaded.sections)).filter((option) => loaded.resume?.units.some((unit) => unit.id === option.id));
  const text = requirement?.kind === "skill" && requirement.skill ? applicationEvidenceText(requirement.skill, evidence, options) : null;
  if (!text) throw new ActionError("That evidence no longer matches this posting or role. Reload and review it.");
  const factId = `application-evidence:${id}:${evidence.id}`;
  const fact = await prisma.$transaction(async (tx) => {
    const existing = await tx.fact.findUnique({ where: { id: factId } });
    if (existing) {
      if (existing.applicationId !== id || existing.text !== text) throw new ActionError("This submission was already saved. Close the form and add a new example to change it.");
      return { id: existing.id, text: existing.text };
    }
    if (await tx.fact.count({ where: { applicationId: id } }) >= 50) throw new ActionError("Remove an application fact before adding another.");
    const fact = await tx.fact.create({ data: { id: factId, applicationId: id, text, sort: await nextSort(tx.fact) }, select: { id: true, text: true } });
    await recordMemorySource(tx, { sourceKey: `fact:${fact.id}`, kind: "EVIDENCE", text: evidence.text, factId: fact.id, applicationId: id, context: { unitId: evidence.targetUnitId, scope: evidence.targetUnitId ? "UNRESOLVED" : "GENERAL", label: options.find(option => option.id === evidence.targetUnitId)?.label ?? "" } });
    return fact;
  });
  refresh(id);
  return { fact, notice: "Information saved for this application. Ask Refine with AI to apply it to an existing document." };
});

// Private notes (E8-9, APP-14). They stay on this server and never go into
// a prompt: no AI task reads the Note table.

const noteBody = z.string().trim().min(1, "Write something first.").max(5000);

export const addNote = action(z.object({ id: z.string().min(1), body: noteBody }), async ({ id, body }) => {
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError(GONE);
  await prisma.note.create({ data: { applicationId: id, body } });
  refresh(id);
  return null;
});

const NOTE_GONE = "That note no longer exists.";

export const updateNote = action(
  z.object({ id: z.string().min(1), noteId: z.string().min(1), body: noteBody }),
  async ({ id, noteId, body }) => {
    const { count } = await prisma.note.updateMany({ where: { id: noteId, applicationId: id }, data: { body } });
    if (count === 0) throw new ActionError(NOTE_GONE);
    refresh(id);
    return null;
  },
);

/** Deletes a note at once; it comes back with its date through `restoreNote` (Undo on the toast). */
export const deleteNote = action(z.object({ id: z.string().min(1), noteId: z.string().min(1) }), async ({ id, noteId }) => {
  const note = await prisma.note.findFirst({ where: { id: noteId, applicationId: id } });
  if (!note) throw new ActionError(NOTE_GONE);
  await prisma.note.delete({ where: { id: note.id } });
  refresh(id);
  return { body: note.body, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() };
});

export const restoreNote = action(
  z.object({ id: z.string().min(1), body: noteBody, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }),
  async ({ id, body, createdAt, updatedAt }) => {
    if (!(await prisma.application.count({ where: { id } }))) throw new ActionError(GONE);
    await prisma.note.create({ data: { applicationId: id, body, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) } });
    refresh(id);
    return null;
  },
);

/**
 * "Leave out" (#217): takes a part off the tailored resume. It's listed with
 * what the page limit left out, so "Put back" brings it back to its place.
 * Returns where it is in that list, for Undo.
 */
export const leaveOutUnit = action(z.object({ id: z.string().min(1), unitId: z.string().min(1) }), async ({ id, unitId }) => {
  const cut = await updateDocuments(id, async (documents) => {
    const units = documents[DocumentKind.RESUME];
    const index = units ? units.findIndex((unit) => unit.id === unitId) : -1;
    if (!units || index < 0) throw new ActionError(PART_GONE);
    const [unit] = units.splice(index, 1);
    return { kind: "unit" as const, unit, index, byHand: true as const };
  });
  // Written after the document itself: updateDocuments checks it wasn't changed meanwhile.
  const row = await prisma.document.findUniqueOrThrow({
    where: { applicationId_kind: { applicationId: id, kind: DocumentKind.RESUME } },
    select: { id: true, trimmed: true },
  });
  const earlier = trimmedSchema.safeParse(row.trimmed);
  const trimmed = [...(earlier.success ? earlier.data : []), cut];
  await prisma.document.update({ where: { id: row.id }, data: { trimmed } });
  refresh(id);
  return { index: trimmed.length - 1 };
});

/**
 * "Put back" (E10-10, #217): restores a part or bullets left out, by hand or
 * to fit the page limit. Putting back twice changes nothing more.
 */
export const putBackTrimmed = action(z.object({ id: z.string().min(1), index: z.number().int().min(0) }), async ({ id, index }) => {
  const row = await prisma.document.findUnique({ where: { applicationId_kind: { applicationId: id, kind: DocumentKind.RESUME } } });
  const trimmed = row ? trimmedSchema.safeParse(row.trimmed) : null;
  const item = trimmed?.success ? trimmed.data[index] : undefined;
  if (!row || !trimmed?.success || !item) throw new ActionError("That's already back. Reload the page to see the resume as it is.");

  await updateDocuments(id, async (documents) => {
    const units = documents[DocumentKind.RESUME];
    if (!units) throw new ActionError(PART_GONE);
    if (item.kind === "unit") {
      if (!units.some((unit) => unit.id === item.unit.id)) units.splice(Math.min(item.index, units.length), 0, item.unit);
      return;
    }
    const unit = units.find((entry) => entry.id === item.unitId);
    if (!unit) throw new ActionError(PART_GONE);
    const lines = unit.text.split("\n");
    unit.text = [...lines, ...item.lines.filter((line) => !lines.includes(line))].filter(Boolean).join("\n");
  });
  const rest = trimmed.data.filter((_, position) => position !== index);
  await prisma.document.update({ where: { id: row.id }, data: { trimmed: rest.length > 0 ? rest : Prisma.DbNull } });
  refresh(id);
  return null;
});

// ─── Versions (E8-10, APP-13) ────────────────────────────────────────────────

const VERSION_GONE = "That version no longer exists. Open the history again to see what's there.";

/** A document's versions, newest first, without their units. */
export const listVersions = action(z.object({ id: z.string().min(1), document: z.enum(DocumentKind) }), async ({ id, document }) => {
  const versions = await prisma.documentVersion.findMany({
    where: { document: { applicationId: id, kind: document } },
    orderBy: { createdAt: "desc" },
    select: { id: true, cause: true, detail: true, createdAt: true },
  });
  return versions.map((version) => ({ ...version, createdAt: version.createdAt.toISOString() }));
});

/** One version's units, to look at before restoring it. */
export const loadVersion = action(z.object({ id: z.string().min(1), versionId: z.string().min(1) }), async ({ id, versionId }) => {
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, document: { applicationId: id } },
    select: { units: true, state: true, document: { select: { kind: true } } },
  });
  if (!version) throw new ActionError(VERSION_GONE);
  return { document: version.document.kind, units: unitsSchema.parse(version.units), state: readDocumentState(version.state) };
});

/**
 * Brings back an earlier version. The document as it is now is saved as a
 * version first (unless it's already the newest), so nothing is lost, and
 * the restored state becomes a version of its own.
 */
export const restoreVersion = action(z.object({ id: z.string().min(1), versionId: z.string().min(1) }), async ({ id, versionId }, { toast }) => {
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, document: { applicationId: id } },
    select: { units: true, state: true, createdAt: true, document: { select: { id: true, kind: true } } },
  });
  if (!version) throw new ActionError(VERSION_GONE);
  const { kind } = version.document;
  const units = unitsSchema.parse(version.units);

  const stillLeftOut = await updateDocuments(
    id,
    async (documents, tx, states) => {
      const current = documents[kind];
      if (!current) throw new ActionError(PART_GONE);
      if (JSON.stringify(current) === JSON.stringify(units) && (!version.state || JSON.stringify(states[kind]) === JSON.stringify(readDocumentState(version.state)))) throw new ActionError("That's the version you have now.");
      const newest = await tx.documentVersion.findFirst({ where: { documentId: version.document.id }, orderBy: { createdAt: "desc" }, select: { units: true, state: true } });
      if (!newest || JSON.stringify(unitsSchema.parse(newest.units)) !== JSON.stringify(current) || JSON.stringify(readDocumentState(newest.state)) !== JSON.stringify(states[kind] ?? null)) {
        await saveVersion(tx, version.document.id, current, { cause: VersionCause.BEFORE_RESTORE });
      }
      documents[kind] = units;
      if (version.state) states[kind] = readDocumentState(version.state);
      // Parts left out that the restored version has again are no longer left out.
      if (kind !== DocumentKind.RESUME) return null;
      const row = await tx.document.findUniqueOrThrow({ where: { id: version.document.id }, select: { trimmed: true } });
      const trimmed = trimmedSchema.safeParse(row.trimmed);
      if (!trimmed.success) return null;
      return trimmed.data.filter((cut) =>
        cut.kind === "unit"
          ? !units.some((unit) => unit.id === cut.unit.id)
          : !cut.lines.every((line) => units.find((unit) => unit.id === cut.unitId)?.text.includes(line)),
      );
    },
    { version: { cause: VersionCause.RESTORED, detail: version.createdAt.toISOString() } },
  );
  // Written after the document itself: updateDocuments checks it wasn't changed meanwhile.
  if (stillLeftOut) {
    await prisma.document.update({
      where: { id: version.document.id },
      data: { trimmed: stillLeftOut.length > 0 ? stillLeftOut : Prisma.DbNull },
    });
  }
  toast(`Restored the ${DOCUMENT_LABELS[kind].toLowerCase()} as it was then. The version you had is in the history too.`);
  refresh(id);
  return null;
});

// ─── A document it was created without (#367) ──────────────────────────────

/**
 * "Write the cover letter" (or resume) on an application created without
 * it: writes it in the background and returns the job's id. Asking again
 * while it's being written follows the same job.
 */
export const startWritingDocument = action(
  z.object({ id: z.string().min(1), kind: z.enum([DocumentKind.RESUME, DocumentKind.COVER_LETTER]) }),
  async ({ id, kind }) => {
    const application = await prisma.application.findUnique({ where: { id }, select: { documents: { select: { kind: true } } } });
    if (!application) throw new ActionError(GONE);
    if (application.documents.some((document) => document.kind === kind)) throw new ActionError("It's been written already. Reload the page to see it.");
    if (!(await isAiConfigured())) throw new ActionError("That needs an AI provider. Choose one in Settings → AI provider.");
    const key = writeDocumentJobKey(id, kind);
    const [running] = await findUnfinishedJobs(key);
    return running?.id ?? startJob(writeDocumentJob, { applicationId: id, kind }, { key, applicationId: id });
  },
);

// ─── The resume's score (#370) ───────────────────────────────────────────────

/** "Score" and "Score again" on the Resume tab: scores the tailored resume in the background and returns the job's id. */
export const startScoringResume = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const resume = await prisma.document.findUnique({ where: { applicationId_kind: { applicationId: id, kind: DocumentKind.RESUME } }, select: { id: true } });
  if (!resume) throw new ActionError((await prisma.application.count({ where: { id } })) ? "Write the tailored resume first." : GONE);
  const problem = await scoringProblem();
  if (problem) throw new ActionError(problem);
  const key = scoreResumeJobKey(id);
  const [running] = await findUnfinishedJobs(key);
  return running?.id ?? startJob(scoreResumeJob, { applicationId: id }, { key, applicationId: id });
});

// ─── The email (Email tab) ───────────────────────────────────────────────────

/**
 * "Write the email" and "Rewrite": writes the application's email in the
 * background and returns the job's id. Asking again while it's being
 * written follows the same job.
 */
export const startWritingEmail = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError(GONE);
  if (!(await isAiConfigured())) throw new ActionError("That needs an AI provider. Choose one in Settings → AI provider.");
  const [running] = await findUnfinishedJobs(emailJobKey(id));
  return running?.id ?? startJob(writeEmailJob, { applicationId: id }, { key: emailJobKey(id), applicationId: id });
});

/**
 * Undo on the "Rewrote the email." toast: puts back the email the rewrite
 * replaced, unless it has changed again since.
 */
export const undoEmailRewrite = action(z.object({ id: z.string().min(1), jobId: z.string().min(1) }), async ({ id, jobId }) => {
  const job = await prisma.job.findFirst({ where: { id: jobId, key: emailJobKey(id), status: "DONE" }, select: { result: true } });
  const result = writeEmailJob.result.safeParse(job?.result);
  const previous = result.success ? result.data.previous : null;
  if (!result.success || !previous) throw new ActionError("There's nothing to undo.");

  const same = (a: unknown, b: unknown) => JSON.stringify(unitsSchema.parse(a)) === JSON.stringify(unitsSchema.parse(b));
  await updateDocuments(id, async (documents, _tx, states) => {
    const current = documents[DocumentKind.EMAIL];
    if (!current) throw new ActionError(PART_GONE);
    if (!same(current, result.data.units) || (result.data.state && JSON.stringify(states.EMAIL) !== JSON.stringify(result.data.state))) {
      throw new ActionError("The email has changed since, so this can't be undone. Earlier versions are in its history.");
    }
    documents[DocumentKind.EMAIL] = previous;
    if (result.data.previousState !== undefined) states.EMAIL = result.data.previousState;
  }, { version: { cause: VersionCause.UNDONE } });
  refresh(id);
  return null;
});
