"use server";

import { z } from "zod";

import { action } from "@/lib/action";
import { OneActionError, testOneConnection } from "@/lib/one/client";
import { loadOneView, oneSetupInput, saveOneConfig } from "@/lib/one/config";

export const saveOneSetup = action(oneSetupInput, (input) => saveOneConfig(input));
export const removeOneSetup = action(z.object({}), () => saveOneConfig(null));
export const checkOneSetup = action(z.object({}), async () => {
  try {
    await testOneConnection();
  } catch (error) {
    if (error instanceof OneActionError) return { view: await loadOneView(), error: error.message };
    throw error;
  }
  return { view: await loadOneView(), error: null };
});
