import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { AiError, getAiProvider } from "@/lib/ai";
import { findHiringContacts } from "@/lib/ai/tasks/find-hiring-contacts";
import { defineJob } from "@/lib/jobs/runner";
import { loadOneSetup } from "@/lib/one/config";
import { peopleResearchSchema } from "@/lib/people/schema";
import { prisma } from "@/lib/prisma";

export const peopleJobKey = (id: string) => `people:${id}`;
export const peopleJobLock = 974634121;
const postingFields = { company: true, role: true, location: true, postingUrl: true, postingText: true } as const;
type PostingFields = Record<keyof typeof postingFields, string>;
export const postingFingerprint = (posting: PostingFields) => createHash("sha256")
  .update(JSON.stringify([posting.company, posting.role, posting.location, posting.postingUrl, posting.postingText])).digest("hex");

export const findHiringContactsJob = defineJob({
  type: "find-hiring-contacts",
  input: z.object({ applicationId: z.string().min(1) }),
  result: peopleResearchSchema,
  async run({ applicationId }, { id, step, signal }) {
    const [posting, setup] = await Promise.all([
      prisma.application.findUnique({ where: { id: applicationId }, select: postingFields }),
      loadOneSetup(),
    ]);
    if (!posting) throw AiError.config("This application is gone.");
    if (!setup?.connectionKey || !setup.reference) throw AiError.config("Connect One and test the Exa permissions in Settings → AI → One.");
    const provider = await getAiProvider();
    if (!provider.toolTurn) throw AiError.config("Set up OpenRouter in Settings → AI to find hiring contacts.");
    await step("Searching for hiring contacts");
    const result = await findHiringContacts(provider.toolTurn.bind(provider), posting, { jobId: id, signal, muapiReady: Boolean(setup.muapiConnectionKey) });
    return peopleResearchSchema.parse({ ...result, version: 1, fingerprint: postingFingerprint(posting), searchedAt: new Date().toISOString() });
  },
  async commit({ applicationId }, result, tx, jobId) {
    const job = await tx.job.findUniqueOrThrow({ where: { id: jobId }, select: { createdAt: true } });
    const newer = await tx.job.findFirst({
      where: { key: peopleJobKey(applicationId), createdAt: { gt: job.createdAt } },
      select: { id: true },
    });
    if (newer) throw AiError.config("A newer search was started for this application.");
    const posting = await tx.application.findUnique({ where: { id: applicationId }, select: postingFields });
    if (!posting || postingFingerprint(posting) !== result.fingerprint) {
      throw AiError.config("The posting changed during this search. Run a new search for the updated posting.");
    }
    const { count } = await tx.application.updateMany({ where: { id: applicationId, ...posting }, data: { peopleResearch: result } });
    if (!count) throw AiError.config("The posting changed during this search. Run a new search for the updated posting.");
  },
});
