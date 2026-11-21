import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient, MemorySource } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockForTransaction } from "@/lib/db-lock";
import { attributionSchema, contextSchema, extractionSchema, normalized, supportedClaim, type MemoryClaim } from "./schema";

export type MemoryDb = PrismaClient | Prisma.TransactionClient;
export const MEMORY_LOCK = 18112026;
export async function memoryState(db: MemoryDb = prisma) {
  return db.memoryState.upsert({ where: { id: "memory" }, create: { id: "memory", fingerprintKey: randomBytes(32).toString("base64url") }, update: {} });
}
export async function advanceMemory(tx: Prisma.TransactionClient) {
  await memoryState(tx);
  return tx.memoryState.update({ where: { id: "memory" }, data: { revision: { increment: 1 } } });
}
export type SourceInput = {
  sourceKey: string; kind: string; text: string; previousText?: string;
  applicationId?: string | null; messageId?: string | null; factId?: string | null; documentId?: string | null;
  context?: Partial<Prisma.JsonObject>; submittedAt?: Date;
};
/** Called in the caller's transaction, never after an uncommitted document mutation. */
export async function recordMemorySource(tx: Prisma.TransactionClient, input: SourceInput) {
  await lockForTransaction(tx, MEMORY_LOCK);
  const state = await memoryState(tx);
  const context = contextSchema.parse(input.context ?? {});
  const previous = await tx.memorySource.findFirst({ where: { sourceKey: input.sourceKey }, orderBy: { revision: "desc" } });
  if (previous?.status === "SUPPRESSED" && contextSchema.parse(previous.context).suppressionHash === createHmac("sha256", state.fingerprintKey).update(normalized(input.text)).digest("hex")) return previous;
  if (previous && previous.text === input.text && JSON.stringify(contextSchema.parse(previous.context)) === JSON.stringify(context)) return previous;
  if (previous?.status === "SUPPRESSED" && !input.text.trim()) return previous;
  if (previous) await withdrawSources(tx, [previous.id]);
  const next = await tx.memoryState.update({ where: { id: state.id }, data: { nextSourceSequence: { increment: 1 } } });
  return tx.memorySource.create({ data: {
    sourceKey: input.sourceKey, revision: (previous?.revision ?? 0) + 1, sequence: next.nextSourceSequence,
    kind: input.kind, text: input.text.slice(0, 10000), previousText: (input.previousText ?? "").slice(0, 10000), context,
    applicationId: input.applicationId, messageId: input.messageId, factId: input.factId, documentId: input.documentId,
    profileEpoch: state.profileEpoch, submittedAt: input.submittedAt, status: input.text.trim() ? "PENDING" : "DONE",
  } });
}
export async function withdrawSources(tx: Prisma.TransactionClient, sourceIds: string[]) {
  const links = await tx.memoryEvidence.findMany({ where: { sourceId: { in: sourceIds }, active: true } });
  await tx.memoryEvidence.updateMany({ where: { sourceId: { in: sourceIds } }, data: { active: false } });
  await tx.memorySource.updateMany({ where: { id: { in: sourceIds } }, data: { status: "SUPPRESSED" } });
  for (const id of new Set(links.map(link => link.memoryFactId))) {
    if (!await tx.memoryEvidence.count({ where: { memoryFactId: id, active: true } })) {
      await tx.memoryFact.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "WITHDRAWN", revision: { increment: 1 } } });
    }
  }
  if (links.length) await advanceMemory(tx);
}
export async function applyMemoryExtraction(source: MemorySource, claims: MemoryClaim[], entries: { id: string; label: string }[]) {
  return prisma.$transaction(async tx => {
    await lockForTransaction(tx, MEMORY_LOCK);
    const current = await tx.memorySource.findUnique({ where: { id: source.id } });
    if (!current || current.status === "SUPPRESSED" || current.status === "DONE") return;
    if (current.text !== source.text || current.previousText !== source.previousText || current.profileEpoch !== source.profileEpoch || current.sequence !== source.sequence) return;
    const latest = await tx.memorySource.findFirst({ where: { sourceKey: source.sourceKey }, orderBy: { revision: "desc" } });
    if (latest?.id !== source.id) return;
    const state = await memoryState(tx);
    const context = contextSchema.parse(source.context);
    let changed = false;
    const allowedIds = new Set((await tx.memoryFact.findMany({ where: { assertedAt: { lte: source.submittedAt }, status: { in: ["ACTIVE", "CONFLICTED"] } }, select: { id: true } })).map(row => row.id));
    for (const claim of claims) {
      if (!supportedClaim(claim, source.text, source.previousText)) continue;
      const entry = source.profileEpoch === state.profileEpoch && context.scope !== "GENERAL" ? entries.find(e => e.id === claim.unitId) : undefined;
      const attribution = attributionSchema.parse({ unitId: entry?.id ?? null, label: entry?.label ?? context.label, scope: entry ? context.scope === "LOCAL" ? "LOCAL" : "GLOBAL" : "GENERAL" });
      const fingerprint = createHmac("sha256", state.fingerprintKey).update(normalized(`${claim.text}|${JSON.stringify(attribution)}`)).digest("hex");
      const existing = await tx.memoryFact.findUnique({ where: { fingerprint } });
      // A new explicit submission can restate forgotten information; backfill cannot.
      if (existing?.status === "FORGOTTEN" && (source.kind === "HISTORICAL" || source.submittedAt <= existing.updatedAt)) continue;
      const replaceId = context.correctionId || claim.replaces;
      if (replaceId && !allowedIds.has(replaceId)) {
        if (context.correctionId) { await tx.memorySource.update({ where: { id: source.id }, data: { status: "SUPPRESSED", error: null } }); return; }
        continue;
      }
      const target = replaceId ? await tx.memoryFact.findUnique({ where: { id: replaceId } }) : null;
      if (target && !context.correctionId && (target.subject !== claim.subject || JSON.stringify(attributionSchema.parse(target.attribution)) !== JSON.stringify(attribution))) continue;
      if (target && context.correctionRevision !== null && target.revision !== context.correctionRevision) {
        await tx.memorySource.update({ where: { id: source.id }, data: { status: "SUPPRESSED", error: null } });
        return;
      }
      if (target && (target.assertedAt > source.submittedAt || target.status === "SUPERSEDED" || target.status === "FORGOTTEN")) continue;
      const capabilities = [...new Set(claim.capabilities.filter(value => normalized(claim.quote).includes(normalized(value)) && !/[:·\r\n]/.test(value)))];
      const roleId = entry?.id.startsWith("experience:") && attribution.scope === "GLOBAL" && await tx.experience.count({ where: { id: entry.id.slice(11) } }) ? entry.id.slice(11) : null;
      const projectId = entry?.id.startsWith("project:") && attribution.scope === "GLOBAL" && await tx.project.count({ where: { id: entry.id.slice(8) } }) ? entry.id.slice(8) : null;
      if (entry && !roleId && !projectId) attribution.scope = "LOCAL";
      const data = { text: claim.text, kind: claim.kind, subject: claim.subject, capabilities, attribution, experienceId: roleId, projectId, assertedAt: source.submittedAt };
      const fact = existing ?? await tx.memoryFact.create({ data: { ...data, fingerprint } });
      if (existing?.status === "WITHDRAWN" || existing?.status === "FORGOTTEN" && source.kind !== "HISTORICAL" && source.submittedAt > existing.updatedAt) await tx.memoryFact.update({ where: { id: fact.id }, data: { ...data, status: "ACTIVE", revision: { increment: 1 } } });
      await tx.memoryEvidence.upsert({ where: { sourceId_memoryFactId: { sourceId: source.id, memoryFactId: fact.id } }, create: { sourceId: source.id, memoryFactId: fact.id, quote: claim.quote }, update: { active: true } });
      if (target && target.id !== fact.id) await tx.memoryFact.update({ where: { id: target.id }, data: { status: "SUPERSEDED", supersededById: fact.id, revision: { increment: 1 } } });
      const conflicts = await tx.memoryFact.findMany({ where: { id: { in: claim.conflicts }, status: "ACTIVE", assertedAt: { lte: source.submittedAt }, subject: claim.subject } });
      if (conflicts.length) await tx.memoryFact.updateMany({ where: { id: { in: [fact.id, ...conflicts.map(row => row.id)] } }, data: { status: "CONFLICTED", revision: { increment: 1 } } });
      changed = true;
    }
    await tx.memorySource.update({ where: { id: source.id }, data: { status: "DONE", error: null, processedAt: new Date(), extraction: (current.extraction ?? { claims }) as Prisma.InputJsonValue, extractedWith: "extract-memory@1" } });
    if (changed) await advanceMemory(tx);
  });
}

export async function forgetMemory(id: string, revision: number) {
  return prisma.$transaction(async tx => {
    await lockForTransaction(tx, MEMORY_LOCK);
    const fact = await tx.memoryFact.findFirst({ where: { id, revision } });
    if (!fact) throw new Error("This memory changed. Reload before forgetting it.");
    const sources = await tx.memoryEvidence.findMany({ where: { memoryFactId: id } });
    await tx.memoryEvidence.deleteMany({ where: { memoryFactId: id } });
    const state = await memoryState(tx);
    for (const link of sources) {
      const source = await tx.memorySource.findUniqueOrThrow({ where: { id: link.sourceId } });
      const suppressionHash = createHmac("sha256", state.fingerprintKey).update(normalized(source.text)).digest("hex");
      await tx.memorySource.update({ where: { id: source.id }, data: { text: "", previousText: "", extraction: Prisma.DbNull, context: contextSchema.parse({ suppressionHash }), status: "SUPPRESSED" } });
    }
    await tx.memoryFact.update({ where: { id }, data: { text: "", subject: "", capabilities: [], attribution: { unitId: null, label: "", scope: "GENERAL" }, experienceId: null, projectId: null, status: "FORGOTTEN", revision: { increment: 1 } } });
    await advanceMemory(tx);
  });
}

export async function detachProfileMemory(tx: Prisma.TransactionClient) {
  await memoryState(tx);
  await tx.memoryState.update({ where: { id: "memory" }, data: { profileEpoch: { increment: 1 }, revision: { increment: 1 } } });
}

export { extractionSchema };
