"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { action, ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { advanceMemory, applyMemoryExtraction, forgetMemory, memoryState, recordMemorySource } from "./store";
import { attributionSchema, privateMemory, contextSchema } from "./schema";
import { scheduleMemory } from "./process";
import { prepareCandidateProfile, candidateMemoryRevision, assertCandidateContext } from "./context";
import { loadProfile } from "@/lib/profile-data";
import { extractedOf } from "@/lib/application-data";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { matchRequirements } from "@/lib/ai/tasks/match-requirements";

export const listMemories = action(z.object({ page: z.number().int().min(0).default(0) }), async ({ page }) => {
  const [facts, count, pending, failed, state] = await Promise.all([
    prisma.memoryFact.findMany({ where: { status: { in: ["ACTIVE", "CONFLICTED"] } }, orderBy: { updatedAt: "desc" }, skip: page * 20, take: 20, include: { evidence: { where: { active: true }, take: 3, include: { source: { select: { applicationId: true, kind: true } } } } } }),
    prisma.memoryFact.count({ where: { status: { in: ["ACTIVE", "CONFLICTED"] } } }),
    prisma.memorySource.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.memorySource.count({ where: { status: "FAILED" } }), memoryState(),
  ]);
  const questions = await prisma.memorySource.findMany({ where: { status: "NEEDS_CONTEXT" }, select: { id: true, error: true }, orderBy: { sequence: "asc" }, take: 20 });
  const profile = await loadProfile();
  const contexts = [...profile.experience.map(entry => ({ id: `experience:${entry.id}`, label: `${entry.role} at ${entry.company}` })), ...profile.projects.map(entry => ({ id: `project:${entry.id}`, label: entry.name }))];
  return { contexts, facts: facts.map(fact => ({ contextUnitId: attributionSchema.parse(fact.attribution).unitId, id: fact.id, text: fact.text, status: fact.status, revision: fact.revision, context: attributionSchema.parse(fact.attribution).label, detached: attributionSchema.parse(fact.attribution).scope !== "GENERAL" && !fact.experienceId && !fact.projectId, evidence: fact.evidence.map(link => ({ quote: link.quote, applicationId: link.source.applicationId })) })), count, pending, failed, questions, paused: state.paused, backfill: state.backfill };
});

export const forgetRememberedFact = action(z.object({ id: z.string(), revision: z.number().int() }), async ({ id, revision }) => {
  await forgetMemory(id, revision);
  revalidatePath("/profile");
  return null;
});

export const correctRememberedFact = action(z.object({ id: z.string(), revision: z.number().int(), text: z.string().trim().min(3).max(1000), unitId: z.string().nullable().optional() }), async ({ id, revision, text, unitId }) => {
  if (privateMemory(text)) throw new ActionError("Keep contact details in your profile, outside reusable memory.");
  const previous = await prisma.memoryFact.findFirst({ where: { id, revision, status: { in: ["ACTIVE", "CONFLICTED"] } } });
  if (!previous) throw new ActionError("This memory changed. Reload before correcting it.");
  let attribution = attributionSchema.parse(previous.attribution);
  if (unitId !== undefined) {
    if (unitId === null) attribution = { unitId: null, label: "", scope: "GENERAL" };
    else {
      const profile = await loadProfile();
      const entry = [...profile.experience.map(entry => ({ id: `experience:${entry.id}`, label: `${entry.role} at ${entry.company}` })), ...profile.projects.map(entry => ({ id: `project:${entry.id}`, label: entry.name }))].find(entry => entry.id === unitId);
      if (!entry) throw new ActionError("That role or project no longer exists. Reload before correcting this memory.");
      attribution = { unitId: entry.id, label: entry.label, scope: "GLOBAL" };
    }
  }
  const source = await prisma.$transaction(tx => recordMemorySource(tx, { sourceKey: `correction:${randomUUID()}`, kind: "CORRECTION", text, context: { ...attribution, correctionId: id, correctionRevision: revision } }));
  const { memoryClaimSchema } = await import("./schema");
  await applyMemoryExtraction(source, [memoryClaimSchema.parse({ text, quote: text, kind: previous.kind, subject: previous.subject, capabilities: [], unitId: attribution.unitId, replaces: id, conflicts: [] })], attribution.unitId ? [{ id: attribution.unitId, label: attribution.label }] : []);
  if ((await prisma.memorySource.findUnique({ where: { id: source.id }, select: { status: true } }))?.status === "SUPPRESSED") throw new ActionError("This memory changed while correcting it. Reload and retry.");
  revalidatePath("/profile");
  return null;
});

export const retryMemory = action(z.object({}), async () => {
  await prisma.memorySource.updateMany({ where: { status: "FAILED" }, data: { status: "PENDING", error: null, attempts: 0 } });
  await scheduleMemory();
  return null;
});

export const pauseMemory = action(z.object({ paused: z.boolean() }), async ({ paused }) => {
  await prisma.$transaction(async tx => {
    await advanceMemory(tx);
    await tx.memoryState.update({ where: { id: "memory" }, data: { paused } });
  });
  if (!paused) await scheduleMemory();
  return null;
});

export const clarifyMemory = action(z.object({ sourceId: z.string(), answer: z.string().trim().min(3).max(1000) }), async ({ sourceId, answer }) => {
  await prisma.$transaction(async tx => {
    const source = await tx.memorySource.findFirst({ where: { id: sourceId, status: "NEEDS_CONTEXT" } });
    if (!source) throw new ActionError("This question has already been resolved. Refresh to continue.");
    await recordMemorySource(tx, { sourceKey: `clarification:${randomUUID()}`, kind: "CHAT", text: `${source.text.slice(0, 8000)}\nClarification from the candidate: ${answer}`, applicationId: source.applicationId, context: contextSchema.parse(source.context) });
    await tx.memorySource.update({ where: { id: sourceId }, data: { status: "DONE", error: null } });
  });
  await scheduleMemory();
  return null;
});

export const matchMemoryStatus = action(z.object({ applicationId: z.string() }), async ({ applicationId }) => {
  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { matchMemoryRevision: true } });
  return { stale: application.matchMemoryRevision !== (await memoryState()).revision };
});

export const refreshMemoryMatch = action(z.object({ applicationId: z.string() }), async ({ applicationId }) => {
  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  const provider = await getAiProvider();
  const profile = await prepareCandidateProfile(await loadProfile(), application.postingText, undefined, provider);
  const result = await matchRequirements(provider, { requirements: extractedOf(application).requirements, profile }, await loadTaskOptions());
  await prisma.$transaction(async tx => {
    await assertCandidateContext(profile, tx);
    await tx.application.update({ where: { id: applicationId }, data: { match: result.data, matchedWith: result.promptVersion, matchMemoryRevision: candidateMemoryRevision(profile) } });
  });
  revalidatePath(`/applications/${applicationId}`);
  return null;
});
