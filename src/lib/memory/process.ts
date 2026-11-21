import "server-only";

import { prisma } from "@/lib/prisma";
import { getAiProvider } from "@/lib/ai";
import { isAiConfigured } from "@/lib/ai/config";
import type { AIProvider } from "@/lib/ai/provider";
import { extractMemory } from "@/lib/ai/tasks/extract-memory";
import { applyMemoryExtraction, memoryState, recordMemorySource } from "./store";
import { selectMemoryRows } from "./selection";
import { contextSchema, extractionSchema, redactMemoryInput } from "./schema";

async function entriesForSource(source: { applicationId: string | null }) {
  const [experience, projects] = await Promise.all([prisma.experience.findMany(), prisma.project.findMany()]);
  const entries = [...experience.map(e => ({ id: `experience:${e.id}`, label: `${e.role} at ${e.company}` })), ...projects.map(e => ({ id: `project:${e.id}`, label: e.name }))];
  if (source.applicationId) {
    const rows = await prisma.document.findMany({ where: { applicationId: source.applicationId }, select: { state: true } });
    const { readDocumentState } = await import("@/lib/document-state");
    for (const row of rows) {
      const state = readDocumentState(row.state);
      if (!state) continue;
      for (const e of state.profile.experience) if (!entries.some(entry => entry.id === `experience:${e.id}`)) entries.push({ id: `experience:${e.id}`, label: `${e.role} at ${e.company}` });
      for (const e of state.profile.projects) if (!entries.some(entry => entry.id === `project:${e.id}`)) entries.push({ id: `project:${e.id}`, label: e.name });
    }
  }
  return entries;
}

export async function processMemorySource(id: string, provider?: AIProvider, signal?: AbortSignal) {
  const source = await prisma.memorySource.findUnique({ where: { id } });
  if (!source || ["DONE", "SUPPRESSED"].includes(source.status)) return;
  if ((await memoryState()).paused) return;
  const claimed = await prisma.memorySource.updateMany({ where: { id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "PROCESSING", attempts: { increment: 1 }, error: null } });
  if (!claimed.count) return;
  try {
    const entries = await entriesForSource(source);
    const context = contextSchema.parse(source.context);
    const earlierRows = await prisma.memoryFact.findMany({ where: { status: { in: ["ACTIVE", "CONFLICTED"] } }, select: { id: true, text: true, subject: true, attribution: true }, orderBy: { createdAt: "desc" } });
    const model = provider ?? await getAiProvider();
    const earlier = await selectMemoryRows(earlierRows, source.text, async () => model, signal, 12000);
    const saved = extractionSchema.safeParse(source.extraction);
    const extraction = saved.success ? saved.data : await extractMemory(model, { text: redactMemoryInput(source.text), previousText: redactMemoryInput(source.previousText), context, entries, earlier }, signal);
    const { claims } = extraction;
    // Save inference before applying so persistence retries need no second paid call.
    const savedResult = await prisma.memorySource.updateMany({ where: { id, status: "PROCESSING", text: source.text, revision: source.revision, profileEpoch: source.profileEpoch }, data: { extraction, extractedWith: "extract-memory@1" } });
    if (!savedResult.count) return;
    await applyMemoryExtraction(source, claims, entries);
    if (extraction.clarifications?.length) await prisma.memorySource.updateMany({ where: { id, status: "DONE" }, data: { status: "NEEDS_CONTEXT", error: extraction.clarifications.join(" "), extraction } });
  } catch (error) {
    await prisma.memorySource.updateMany({ where: { id, status: "PROCESSING" }, data: { status: "FAILED", error: "Memory could not be processed. Retry in Profile → Facts about me." } });
    throw error;
  }
}

/** Run prerequisites directly, never wait for another job while occupying a provider slot. */
export async function flushMemory(provider?: AIProvider, signal?: AbortSignal) {
  const state = await memoryState();
  if (state.paused) return;
  const pending = await prisma.memorySource.findMany({ where: { sequence: { lte: state.nextSourceSequence }, status: { in: ["PENDING", "FAILED"] } }, orderBy: { sequence: "asc" } });
  if (pending.length && !provider && !await isAiConfigured()) throw new Error("Some remembered information is pending. Configure AI or pause memory in Profile to continue without it.");
  for (const source of pending) {
    if (signal?.aborted) throw new Error("Cancelled.");
    await processMemorySource(source.id, provider, signal);
  }
  const deadline = Date.now() + 120000;
  while (true) {
    if (signal?.aborted) throw new Error("Cancelled.");
    if ((await prisma.memoryState.findUnique({ where: { id: "memory" }, select: { paused: true } }))?.paused) return;
    const unfinished = await prisma.memorySource.findFirst({ where: { sequence: { lte: state.nextSourceSequence }, status: { in: ["PENDING", "PROCESSING", "FAILED"] } } });
    if (!unfinished) break;
    if (unfinished.status === "FAILED") throw new Error("Remembered information could not be processed. Retry in Profile → Facts about me.");
    if (Date.now() >= deadline) throw new Error("Remembered information is still processing. Try again when it finishes.");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/** Historical imports use original timestamps and source keys; generated evidence wrappers are excluded. */
export async function backfillMemory(batchSize = 10) {
  const state = await memoryState();
  if (state.paused) return 0;
  const [facts, messages] = await Promise.all([
    prisma.fact.findMany({ where: { applicationId: { not: null }, text: { not: "" }, application: { origin: "MANUAL", documents: { none: { writtenWith: "claude-chat" } } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.chatMessage.findMany({ where: { role: "USER", NOT: { id: { startsWith: "application-evidence-message:" } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const candidates = [...facts.map(row => ({ key: `fact:${row.id}`, text: row.text, applicationId: row.applicationId, factId: row.id, submittedAt: row.updatedAt })), ...messages.map(row => ({ key: `message:${row.id}`, text: row.text, applicationId: row.applicationId, messageId: row.id, submittedAt: row.createdAt }))].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const recorded = await prisma.memorySource.findMany({ select: { sourceKey: true, factId: true, messageId: true } });
  const known = new Set(recorded.flatMap(row => [row.sourceKey, ...(row.factId ? [`fact:${row.factId}`] : []), ...(row.messageId ? [`message:${row.messageId}`] : [])]));
  const next = candidates.filter(row => !known.has(row.key)).slice(0, batchSize);
  for (const { key, ...row } of next) await prisma.$transaction(tx => recordMemorySource(tx, { ...row, sourceKey: key, kind: "HISTORICAL", context: { scope: "UNRESOLVED" } }));
  await prisma.memoryState.update({ where: { id: "memory" }, data: { backfill: { recorded: known.size + next.length, remaining: Math.max(0, candidates.filter(row => !known.has(row.key)).length - next.length), status: next.length === batchSize ? "RUNNING" : "DONE" } } });
  return next.length;
}

export async function scheduleMemory() {
  const state = await memoryState();
  if (state.paused || !await isAiConfigured()) return;
  const hasPending = await prisma.memorySource.count({ where: { status: { in: ["PENDING", "FAILED"] } } });
  if (!hasPending && state.backfill && typeof state.backfill === "object" && !Array.isArray(state.backfill) && state.backfill.status === "DONE") return;
  const { startJob, findUnfinishedJobs } = await import("@/lib/jobs/runner");
  if ((await findUnfinishedJobs("memory-capture")).length) return;
  const unresolved = await prisma.memorySource.count({ where: { status: "FAILED", attempts: { gte: 3 } } });
  if (unresolved) return;
  const { captureMemoryJob } = await import("@/lib/jobs/capture-memory");
  await startJob(captureMemoryJob, {}, { key: "memory-capture" });
}

export function startMemorySchedule() {
  const global = globalThis as typeof globalThis & { memoryTimer?: ReturnType<typeof setInterval> };
  if (global.memoryTimer) return;
  const tick = () => void scheduleMemory().catch(() => { /* Pending sources remain durable for retry. */ });
  global.memoryTimer = setInterval(tick, 30000);
  global.memoryTimer.unref?.();
  tick();
}
