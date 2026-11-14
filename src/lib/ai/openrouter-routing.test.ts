import { afterEach, expect, it, vi } from "vitest";
import { MODEL_ASSIGNMENTS, LUNA, SONNET, OPENROUTER_URL } from "./assignments";
import { OpenRouterProvider } from "./providers/openrouter";
import { json, stubFetch } from "./test-http";
import type { UsageEntry } from "@/lib/usage";

afterEach(() => vi.unstubAllGlobals());
it("routes every task, overrides low effort, and records the actual model in compound jobs", async () => {
  const requests = stubFetch(() => json({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
  const usage: UsageEntry[] = [];
  const provider = new OpenRouterProvider("OPENAI", OPENROUTER_URL, "test-key", LUNA, 10000, (entry) => usage.push(entry));
  for (const assignment of MODEL_ASSIGNMENTS) {
    await provider.complete({ task: assignment.task, system: "Test", messages: [{ role: "user", content: "Test" }], effort: "low" });
  }
  expect(requests).toHaveLength(10);
  MODEL_ASSIGNMENTS.forEach((assignment, index) => {
    expect(requests[index].body).toMatchObject({ model: assignment.model, reasoning_effort: "medium", provider: { data_collection: "deny" } });
    expect(requests[index].url.href).toBe(`${OPENROUTER_URL}/chat/completions`);
    expect(usage[index]).toMatchObject({ task: assignment.task, model: assignment.model, provider: "OPENROUTER" });
  });
  expect(new Set(usage.map((entry) => entry.model))).toEqual(new Set([LUNA, SONNET]));
});
it("does not silently drop medium effort when the host rejects it", async () => {
  const requests = stubFetch(() => json({ error: { message: "Unsupported reasoning_effort" } }, { status: 400 }));
  const provider = new OpenRouterProvider("OPENAI", OPENROUTER_URL, "test-key", LUNA, 10000);
  await expect(provider.complete({ task: "extract-posting", system: "Test", messages: [] })).rejects.toThrow();
  expect(requests).toHaveLength(1);
});
