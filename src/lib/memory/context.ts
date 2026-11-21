import "server-only";
import { selectMemoryRows } from "./selection";
import type { ProfileData } from "@/lib/profile";
import type { AIProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/prisma";
import { getAiProvider } from "@/lib/ai";
import { flushMemory } from "./process";
import { attributionSchema, normalized, privateMemory } from "./schema";
import { memoryState, MEMORY_LOCK, type MemoryDb } from "./store";
import { lockForTransaction } from "@/lib/db-lock";
import type { Prisma } from "@/generated/prisma/client";

const revisions = new WeakMap<ProfileData, number>();
export const candidateMemoryRevision = (profile: ProfileData) => revisions.get(profile);
export async function assertCandidateContext(profile: ProfileData, tx?: Prisma.TransactionClient) {
  const revision = revisions.get(profile);
  if (revision === undefined) return;
  await assertMemoryRevision(revision, tx);
}

export async function prepareCandidateProfile(profile: ProfileData, query = "", signal?: AbortSignal, provider?: AIProvider, { processPending = true } = {}): Promise<ProfileData> {
  if (processPending) await flushMemory(provider, signal);
  const state = await memoryState();
  const globalFacts = await prisma.fact.findMany({ where: { applicationId: null }, select: { id: true, text: true }, orderBy: { sort: "asc" } });
  if (state.paused) { const result = { ...profile, facts: globalFacts }; revisions.set(result, state.revision); return result; }
  const rows = (await prisma.memoryFact.findMany({ where: { status: "ACTIVE", evidence: { some: { active: true } } }, orderBy: { id: "asc" } })).filter(row => !privateMemory(row.text));
  const selected = await selectMemoryRows(rows, query, async () => provider ?? await getAiProvider(), signal);
  const facts = [...globalFacts];
  const seen = new Set(facts.map(row => normalized(row.text)));
  for (const row of selected) {
    if (seen.has(normalized(row.text))) continue;
    const attribution = attributionSchema.parse(row.attribution);
    const unitExists = profile.experience.some(entry => `experience:${entry.id}` === attribution.unitId) || profile.projects.some(entry => `project:${entry.id}` === attribution.unitId);
    const context = attribution.unitId && unitExists ? `${attribution.label} (${attribution.unitId})` : attribution.label ? `Historical context: ${attribution.label}; do not assign to another role` : "General capability; do not attribute to a role or project";
    facts.push({ id: `memory:${row.id}`, text: `Remembered ${row.kind.toLowerCase()}: ${row.text}\nContext: ${context}\nCapabilities: ${(["EXPERIENCE", "ACHIEVEMENT", "CAPABILITY"].includes(row.kind) && Array.isArray(row.capabilities) ? row.capabilities : []).join(" · ")}` });
    seen.add(normalized(row.text));
  }
  const result = { ...profile, facts };
  revisions.set(result, state.revision);
  return result;
}

export async function assertMemoryRevision(revision: number, db: MemoryDb = prisma) {
  if (db !== prisma) await lockForTransaction(db as Prisma.TransactionClient, MEMORY_LOCK);
  if ((await db.memoryState.findUnique({ where: { id: "memory" } }))?.revision !== revision) throw new Error("Remembered information changed while working. Retry to use the current facts.");
}

/** Exclude old application fact mirrors after correction or forgetting. */
export async function currentApplicationFactTexts(applicationId: string, facts: { id: string; text: string }[]) {
  const sources = await prisma.memorySource.findMany({ where: { applicationId, factId: { in: facts.map(row => row.id) } }, include: { evidence: { include: { memoryFact: true } } }, orderBy: { revision: "desc" } });
  return facts.filter(fact => {
    const source = sources.find(row => row.factId === fact.id);
    return !source || (source.status !== "SUPPRESSED" && !source.evidence.some(link => ["SUPERSEDED", "FORGOTTEN", "CONFLICTED", "WITHDRAWN"].includes(link.memoryFact.status)));
  }).map(row => row.text.trim()).filter(Boolean);
}
