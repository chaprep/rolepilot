import "server-only";

import { z } from "zod";

import { ActionError } from "@/lib/action";
import { getAiProvider } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { applicationResearchInput, researchForWriting, saveApplicationResearch } from "@/lib/research/application";
import { loadSettings } from "@/lib/settings-data";

import { defineJob } from "./runner";

export const refreshResearchJobKey = (id: string) => `company-research:${id}`;

export const refreshResearchJob = defineJob({
  type: "refresh-company-research",
  input: z.object({ applicationId: z.string().min(1) }),
  result: z.object({ applicationId: z.string() }),
  async run({ applicationId }, context) {
    const [application, settings, provider] = await Promise.all([
      prisma.application.findUnique({ where: { id: applicationId }, include: { startup: { select: { website: true } } } }),
      loadSettings(),
      getAiProvider(),
    ]);
    if (!application) throw new ActionError("That application no longer exists.");
    const result = await researchForWriting(applicationResearchInput(application), settings, provider, context, undefined, true);
    if (!result) throw new ActionError("Enable company research in Settings → AI first.");
    context.signal.throwIfAborted();
    if (!await saveApplicationResearch(application, result)) throw new ActionError("The application changed during research. Refresh the findings again.");
    return { applicationId };
  },
});
