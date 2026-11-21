import "server-only";
import { z } from "zod";
import { defineJob } from "./runner";
import { backfillMemory, flushMemory } from "@/lib/memory/process";
import { getAiProvider } from "@/lib/ai";

export const captureMemoryJob = defineJob({
  type: "capture-memory", input: z.object({}), result: z.object({ completed: z.boolean() }),
  async run(_, { step, signal }) {
    await step("Remembering candidate information");
    await flushMemory(await getAiProvider(), signal);
    await backfillMemory();
    await flushMemory(await getAiProvider(), signal);
    return { completed: true };
  },
});
