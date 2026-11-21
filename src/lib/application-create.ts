import "server-only";
import { recordMemorySource } from "@/lib/memory/store";
import { assertMemoryRevision } from "@/lib/memory/context";

import { AgentCandidateStatus, ApplicationOrigin, type Tone } from "@/generated/prisma/enums";
import { ActionError } from "@/lib/action";
import { summaryText, tailoringSummary } from "@/lib/ai/tailoring-summary";
import { calendarDay } from "@/lib/application-documents";
import type { Extracted, Match } from "@/lib/application-data";
import { documentLabels } from "@/lib/document-labels";
import { documentLanguage } from "@/lib/document-language";
import type { WriteDocumentsResult } from "@/lib/jobs/write-documents";
import { sidebarLetterUnits } from "@/lib/cover-letter-format";
import { newFrame, withFrame } from "@/lib/letter-frame";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

// Creating an application from finished documents (E7-6), shared by New
// application and the job agent (E16-5): the Draft application, its resume
// and cover letter in the base theme, and the opening chat message, in one
// transaction. Nothing is trimmed to a page limit any more (#234).

export type ApplicationDetails = {
  title: string;
  company: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  /** "2026-10-15", or "" when there's no deadline. */
  deadline: string;
};

/** What was read from the posting, as the read-posting job left it. */
export type ApplicationReading = {
  posting: string;
  extracted: Extracted;
  extractedWith: string;
  matchedWith: string;
  memoryRevision?: number;
};

/**
 * Who's creating it, and the claim that stops a second click, a retry or a
 * second run from making two applications: the write-documents job for New
 * application, the candidate (DRAFTING → DRAFTED) for the agent. Claude chat
 * saves through the connector (#221), where one call makes one application.
 */
export type ApplicationClaim =
  | { kind: "manual"; writeJobId: string; readJobId: string; postingId: string | null; startupId?: string | null }
  | { kind: "agent"; candidateId: string; score: number }
  | { kind: "connector"; postingId: string | null };

export type CreateApplicationInput = {
  reading: ApplicationReading;
  documents: WriteDocumentsResult;
  /** The match as shown, which the documents were written from. */
  match: Match;
  details: ApplicationDetails;
  /** A checked http(s) link, or "". */
  postingUrl: string;
  tone: Tone;
  note: string;
  evidenceFacts?: string[];
  claim: ApplicationClaim;
};

const CLAIMED = "application:";

/** Creates the application once; creating again with the same claim returns the one that exists. */
export async function createApplicationFromDocuments({ reading, documents, match, details, postingUrl, tone, note, evidenceFacts = [], claim }: CreateApplicationInput): Promise<string> {
  const [settings, profile] = await Promise.all([loadSettings(), loadProfile()]);
  const { extracted, extractedWith, matchedWith } = reading;
  const language = "English";
  // E8-11: every part of the letter is a unit. The AI wrote the recipient
  // and greeting; the sender and signature come from the profile, and the
  // date is written now, in the letter's language.
  const letter = sidebarLetterUnits(withFrame(
    documents.letter,
    newFrame({
      basics: profile.basics,
      company: details.company,
      location: details.location,
      date: calendarDay(),
      dateFormat: settings.dateFormat,
      lang: documentLanguage(language, documents.letter.map((unit) => unit.text).join(" ")).lang,
      labels: documentLabels(language),
    }),
  ), details.role.trim() || profile.basics.headline);
  const summary = tailoringSummary({
    profile,
    company: details.company,
    role: details.role,
    match,
    resume: documents.resume,
    letter: documents.letter,
    tone,
    note,
    references: !settings.includeRefs ? "setting-off" : extracted.asksForReferences ? "included" : "not-asked",
    strict: settings.strict,
    showChanges: settings.showDiff,
  });

  const created = await prisma.$transaction(async (tx) => {
    if (documents.memoryRevision !== undefined) await assertMemoryRevision(documents.memoryRevision, tx);
    if (claim.kind === "manual") {
      // Claim the job first: a second click waits here, then finds it taken.
      const { count } = await tx.job.updateMany({ where: { id: claim.writeJobId, key: null }, data: { key: `${CLAIMED}pending` } });
      if (count === 0) {
        const claimed = await tx.job.findUniqueOrThrow({ where: { id: claim.writeJobId }, select: { key: true } });
        if (claimed.key?.startsWith(CLAIMED) && claimed.key !== `${CLAIMED}pending`) return { id: claimed.key.slice(CLAIMED.length), isNew: false };
        throw new ActionError("This application is already being created.");
      }
    } else if (claim.kind === "agent") {
      // The agent claimed the candidate before it wrote anything; only that claim may create its draft.
      const { count } = await tx.agentCandidate.updateMany({
        where: { id: claim.candidateId, status: AgentCandidateStatus.DRAFTING },
        data: { status: AgentCandidateStatus.DRAFTED, error: null },
      });
      if (count === 0) throw new ActionError("That posting is no longer waiting for a draft.");
    }

    const application = await tx.application.create({
      data: {
        // An agent draft stays on the Agent screen until it's approved (#195).
        ...(claim.kind === "agent" ? { origin: ApplicationOrigin.AGENT, agentScore: claim.score, awaitingReview: true } : {}),
        title: details.title || [details.role, details.company].filter(Boolean).join(" · ") || "Untitled application",
        company: details.company,
        role: details.role,
        location: details.location,
        mode: details.mode,
        salary: details.salary,
        deadline: details.deadline ? new Date(`${details.deadline}T00:00:00Z`) : null,
        postingUrl,
        postingText: reading.posting,
        companyResearch: documents.companyResearch,
        extracted,
        extractedWith,
        match,
        matchedWith,
        matchMemoryRevision: reading.memoryRevision,
        tone,
        // "Anything I should know?" becomes the application's first fact (APP-15).
        ...((note.trim() || evidenceFacts.length) ? { facts: { create: [...(note.trim() ? [{ text: note.trim(), sort: 0 }] : []), ...evidenceFacts.map((text, index) => ({ text, sort: index + 1 }))] } } : {}),
        language,
        documents: {
          // Each starts its history with the first draft (E8-10). One that wasn't
          // asked for isn't there, and can be written from the application (#367).
          create: [
            ...(documents.resumeWith
              ? [
                  {
                    kind: "RESUME" as const,
                    units: documents.resume,
                    themeId: settings.baseThemeId,
                    writtenWith: documents.resumeWith,
                    versions: { create: { units: documents.resume, cause: "WRITTEN" as const } },
                  },
                ]
              : []),
            ...(documents.letterWith
              ? [
                  {
                    kind: "COVER_LETTER" as const,
                    initialLetterLayout: "SIDEBAR",
                    units: letter,
                    themeId: settings.baseThemeId,
                    writtenWith: documents.letterWith,
                    versions: { create: { units: letter, cause: "WRITTEN" as const } },
                  },
                ]
              : []),
          ],
        },
        messages: { create: { role: "AI", text: summaryText(summary) } },
      },
      select: { id: true },
    });

    // Notes created by internal/model callers have no asserted user provenance.
    // Mark their origin durably so historical backfill cannot promote them.
    const createdFacts = await tx.fact.findMany({ where: { applicationId: application.id } });
    for (const fact of createdFacts) {
      const captured = await tx.memorySource.count({ where: { OR: [{ factId: fact.id }, ...(claim.kind === "manual" ? [{ sourceKey: { startsWith: `draft:${claim.readJobId}:` }, text: { not: "" } }] : [])] } });
      if (!captured) await recordMemorySource(tx, { sourceKey: `fact:${fact.id}`, kind: "MODEL_NOTE", text: "", applicationId: application.id, factId: fact.id });
    }
    if (claim.kind === "manual") {
      const pendingSources = await tx.memorySource.findMany({ where: { sourceKey: { startsWith: `draft:${claim.readJobId}:` }, applicationId: null } });
      const savedFacts = await tx.fact.findMany({ where: { applicationId: application.id }, orderBy: { sort: "asc" } });
      for (const source of pendingSources) await tx.memorySource.update({ where: { id: source.id }, data: { applicationId: application.id, factId: savedFacts.find(fact => fact.text.includes(source.text))?.id } });
      const key = `${CLAIMED}${application.id}`;
      await tx.job.updateMany({ where: { id: { in: [claim.writeJobId, claim.readJobId] } }, data: { key, applicationId: application.id } });
      // The posting it came from shows it as applied for (E14-8); one already linked keeps its application.
      if (claim.postingId) {
        await tx.posting.updateMany({ where: { id: claim.postingId, applicationId: null }, data: { applicationId: application.id } });
      }
      // The startup it was written to (#222): it counts as contacted once the application is sent.
      if (claim.startupId) {
        await tx.startup.updateMany({ where: { id: claim.startupId, applicationId: null }, data: { applicationId: application.id } });
      }
    } else if (claim.kind === "agent") {
      await tx.agentCandidate.update({ where: { id: claim.candidateId }, data: { applicationId: application.id } });
    } else if (claim.postingId) {
      await tx.posting.updateMany({ where: { id: claim.postingId, applicationId: null }, data: { applicationId: application.id } });
    }
    return { id: application.id, isNew: true };
  });
  return created.id;
}
