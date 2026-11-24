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
  expect(requests).toHaveLength(MODEL_ASSIGNMENTS.length);
  MODEL_ASSIGNMENTS.forEach((assignment, index) => {
    expect(requests[index].body).toMatchObject({ model: assignment.model, reasoning_effort: "medium", provider: { data_collection: "deny" } });
    expect(requests[index].url.href).toBe(`${OPENROUTER_URL}/chat/completions`);
    expect(usage[index]).toMatchObject({ task: assignment.task, model: assignment.model, provider: "OPENROUTER" });
  });
  expect(new Set(usage.map((entry) => entry.model))).toEqual(new Set([LUNA, SONNET]));
  expect(usage.find(({ task }) => task === "refine-chat")?.model).toBe(LUNA);
  expect(usage.find(({ task }) => task === "refine-email-chat")?.model).toBe(SONNET);
});
it("does not silently drop medium effort when the host rejects it", async () => {
  const requests = stubFetch(() => json({ error: { message: "Unsupported reasoning_effort" } }, { status: 400 }));
  const provider = new OpenRouterProvider("OPENAI", OPENROUTER_URL, "test-key", LUNA, 10000);
  await expect(provider.complete({ task: "extract-posting", system: "Test", messages: [] })).rejects.toThrow();
  expect(requests).toHaveLength(1);
});

it("sends native tool definitions and preserves multiple tool call IDs, raw arguments and reasoning across turns", async () => {
  const calls = [
    { id: "search-1", type: "function", function: { name: "searchWeb", arguments: '{"query":"Ledgerly"}' } },
    { id: "read-1", type: "function", function: { name: "readPage", arguments: "{malformed" } },
  ];
  const reasoning = [{ type: "reasoning.encrypted", data: "opaque" }];
  const requests = stubFetch(({ body }) => json({
    choices: [{ message: (body as { messages: unknown[] }).messages.length === 2
      ? { content: null, tool_calls: calls, reasoning_details: reasoning } : { content: "Final findings" } }],
    usage: { prompt_tokens: 10, completion_tokens: 3 },
  }));
  const usage: UsageEntry[] = [];
  const provider = new OpenRouterProvider("OPENAI", OPENROUTER_URL, "test-key", LUNA, 10_000, (entry) => usage.push(entry));
  const query = {
    task: "write-cover-letter" as const, system: "Research",
    tools: [{ name: "searchWeb", description: "Search", parameters: { type: "object", properties: { query: { type: "string" } } } }],
    messages: [{ role: "user" as const, content: "Ledgerly" }],
  };
  const first = await provider.toolTurn(query);
  expect(first).toEqual({ text: "", calls: calls.map(({ id, function: call }) => ({ id, ...call })), continuation: reasoning });
  const second = await provider.toolTurn({ ...query, allowTools: false, messages: [
    ...query.messages,
    { role: "assistant", content: first.text, calls: first.calls, continuation: first.continuation },
    { role: "tool", callId: "search-1", content: "Search result" },
    { role: "tool", callId: "read-1", content: "Argument malformed" },
  ] });
  expect(second).toMatchObject({ text: "Final findings", calls: [] });
  expect(requests[0].body).toMatchObject({ model: SONNET, provider: { require_parameters: true, data_collection: "deny" }, tools: query.tools.map((tool) => ({ type: "function", function: tool })) });
  expect(requests[1].body).toMatchObject({ tool_choice: "none", messages: [
    { role: "system" }, { role: "user" },
    { role: "assistant", tool_calls: calls, reasoning_details: reasoning },
    { role: "tool", tool_call_id: "search-1" },
    { role: "tool", tool_call_id: "read-1" },
  ] });
  expect(usage).toEqual(Array.from({ length: 2 }, () => ({ task: "write-cover-letter", provider: "OPENROUTER", model: SONNET, input: 10, output: 3 })));
});

it("reports a model without tool-capable endpoints without retrying", async () => {
  const requests = stubFetch(() => json({ error: { message: "No endpoints found that support tool use" } }, { status: 404 }));
  const provider = new OpenRouterProvider("OPENAI", OPENROUTER_URL, "test-key", LUNA, 10_000);
  await expect(provider.toolTurn({ task: "write-cover-letter", system: "Test", messages: [], tools: [] })).rejects.toThrow();
  expect(requests).toHaveLength(1);
});
