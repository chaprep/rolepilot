"use server";

import { recordMemorySource, withdrawSources, advanceMemory } from "@/lib/memory/store";
import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { nextSort } from "@/lib/profile-entries";

// Facts the user tells the AI (PRO-14, APP-15): the profile's own when
// applicationId is null, else one application's. Added blank, autosaved as
// typed, removed at once with Undo.

const id = z.string().min(1);
const applicationId = id.nullable();
/** About a short paragraph: a fact, not a document. */
const text = z.string().max(1000);
/** Plenty for one person or one application, and still a prompt a local model can take. */
const MAX_FACTS = 50;

async function checkRoom(applicationId: string | null) {
  if (applicationId && !(await prisma.application.findUnique({ where: { id: applicationId }, select: { id: true } }))) {
    throw new ActionError("This application doesn't exist any more.");
  }
  if ((await prisma.fact.count({ where: { applicationId } })) >= MAX_FACTS) {
    throw new ActionError(`That's ${MAX_FACTS} facts already. Remove one you no longer need first.`);
  }
}

export const createFact = action(z.object({ applicationId }), async ({ applicationId }) => {
  await checkRoom(applicationId);
  return prisma.fact.create({ data: { applicationId, sort: await nextSort(prisma.fact) }, select: { id: true, text: true } });
});

export const saveFact = action(z.object({ id, text }), async ({ id, text }) => {
  await prisma.$transaction(async tx => {
    const fact = await tx.fact.findUnique({ where: { id } });
    await tx.fact.updateMany({ where: { id }, data: { text } });
    if (fact && !fact.applicationId && fact.text !== text) await advanceMemory(tx);
    if (fact?.applicationId && fact.text !== text) await recordMemorySource(tx, { sourceKey: `fact:${id}`, kind: "FACT", text, factId: id, applicationId: fact.applicationId, context: { scope: "UNRESOLVED" } });
  });
  return null;
});

/** Answers with where it was, for Undo. */
export const removeFact = action(z.object({ id }), async ({ id }) => {
  const fact = await prisma.fact.findUnique({ where: { id }, select: { sort: true } });
  await prisma.$transaction(async tx => {
    const sources = await tx.memorySource.findMany({ where: { factId: id }, select: { id: true } });
    await withdrawSources(tx, sources.map(row => row.id));
    await tx.fact.deleteMany({ where: { id } });
  });
  return { sort: fact?.sort ?? null };
});

/** Undo: back with its id and text, in its old place when that's known. */
export const restoreFact = action(
  z.object({ id, applicationId, text, sort: z.number().int().nullable() }),
  async ({ id, applicationId, text, sort }) => {
    await checkRoom(applicationId);
    const restored = await prisma.fact.upsert({
      where: { id },
      create: { id, applicationId, text, sort: sort ?? (await nextSort(prisma.fact)) },
      update: {},
      select: { id: true, text: true },
    });
    if (applicationId) await prisma.$transaction(async tx => {
      const sources = await tx.memorySource.findMany({ where: { sourceKey: `fact:${id}`, text: { not: "" } }, orderBy: { revision: "desc" }, take: 1 });
      if (sources.length) {
        await tx.memorySource.update({ where: { id: sources[0].id }, data: { factId: id, status: "PENDING", extraction: undefined } });
      }
    });
    return restored;
  },
);
