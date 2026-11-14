"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { saveSettings } from "@/lib/settings-data";
import { SETUP_STEPS } from "@/lib/setup-guide";

/** Remembers the step the guide is on; Done, or leaving the guide, finishes it (E21). */
export const saveSetupGuide = action(z.object({ step: z.enum(SETUP_STEPS), finished: z.boolean() }), async (setupGuide) => {
  await saveSettings({ setupGuide });
  return null;
});

/** Legacy actions reject old clients without changing their saved credentials. */
export const connectAi = action(z.object({ choice: z.string(), key: z.string().optional() }),
  async (): Promise<{connected: true; model: string; seconds: number} | {connected:false; kind:"config"; message:string}> => {
    throw new ActionError("Connect OpenRouter in Settings → AI provider.");
  });
export const findLocalAi = action(z.object({choice:z.string()}),
  async (): Promise<{found:false} | {found:true; baseUrl:string; models:string[]; model:string|null}> => {
    throw new ActionError("This installation uses OpenRouter.");
  });
