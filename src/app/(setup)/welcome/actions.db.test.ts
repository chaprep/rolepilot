import { afterAll, beforeEach, expect, it, vi } from "vitest";

import type { AiConfig } from "@/lib/ai/config";
import { MockProvider } from "@/lib/ai/providers/mock";
import { loadSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { connectAi, findLocalAi, saveSetupGuide } from "./actions";

// The actions run against the test database, signed in.
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));
vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "a".repeat(32) } }));
// The real config and key handling, with a mock model behind them, made for each config.
const ai = vi.hoisted(() => ({ make: undefined as unknown as (config: AiConfig) => unknown, configs: [] as AiConfig[] }));
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  createProvider: vi.fn((config: AiConfig) => {
    ai.configs.push(config);
    return ai.make(config);
  }),
}));

const prisma = () => db.client!;

beforeEach(async () => {
  await resetDatabase(prisma());
  ai.configs = [];
  ai.make = (config) => new MockProvider({ model: config.model, models: ["gpt-6-luna", "gpt-6.1-terra", "whisper"] });
});
afterAll(() => prisma().$disconnect());

it("rejects legacy setup without changing credentials", async () => {
 const before=await loadSettings();
 expect(await connectAi({choice:"anthropic",key:"unrelated"})).toMatchObject({ok:false});
 expect(await findLocalAi({choice:"ollama"})).toMatchObject({ok:false});
 expect(await loadSettings()).toEqual(before);
});
it("retains setup progress", async () => {
 expect(await saveSetupGuide({step:"ai",finished:false})).toMatchObject({ok:true});
 expect((await loadSettings()).setupGuide).toEqual({step:"ai",finished:false});
});
