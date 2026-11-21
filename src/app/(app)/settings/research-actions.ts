"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { verifyZyte } from "@/lib/research/connection";
import { applySecretChange, secretState, ZYTE_KEY } from "@/lib/secrets";
import { loadSettings, saveSettings } from "@/lib/settings-data";

const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), value: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("clear") }),
]);

export const saveZyteKey = action(changeSchema, async (change) => {
  const stored = applySecretChange(ZYTE_KEY, null, change);
  await saveSettings({ zyteKeyEnc: stored, companyResearchEnabled: false, zyteVerified: false });
  return { keyState: secretState(ZYTE_KEY, stored), enabled: false, verified: false };
});

async function verifyAndSave(enable: boolean) {
  const settings = await loadSettings();
  const stored = settings.zyteKeyEnc;
  if (!stored) throw new ActionError("Save a Zyte API key first.");
  if (secretState(ZYTE_KEY, stored) === "unreadable") throw new ActionError("The saved Zyte key can’t be read. Enter it again.");
  if (!enable || !settings.zyteVerified) await verifyZyte(stored);
  return prisma.$transaction(async (tx) => {
    // Lock the exact credential row before updating settings so a concurrent replacement resets verification.
    const { count } = await tx.setting.updateMany({ where: { key: "zyteKeyEnc", value: stored }, data: { value: stored } });
    if (!count) throw new ActionError("The saved Zyte key changed. Test the current key.");
    await saveSettings({ zyteVerified: true, ...(enable ? { companyResearchEnabled: true } : {}) }, tx);
    const current = await loadSettings(tx);
    return { keyState: "set" as const, enabled: current.companyResearchEnabled, verified: true };
  });
}

export const testZyteConnection = action(z.object({}), () => verifyAndSave(false));
export const setCompanyResearch = action(z.object({ enabled: z.boolean() }), async ({ enabled }) => {
  if (enabled) return verifyAndSave(true);
  await saveSettings({ companyResearchEnabled: false });
  const current = await loadSettings();
  return { keyState: secretState(ZYTE_KEY, current.zyteKeyEnc), enabled: false, verified: current.zyteVerified };
});
