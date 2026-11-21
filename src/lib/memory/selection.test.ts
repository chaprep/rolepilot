import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/ai/providers/mock";
import { selectMemoryRows } from "./selection";
import { redactMemoryInput } from "./schema";
import { extractMemory } from "@/lib/ai/tasks/extract-memory";

describe("memory context limits and extraction", () => {
  it("considers every batch including old evidence and rejects invented selection IDs", async () => {
    const seen: string[] = [];
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), text: i === 0 ? "Docker deployment experience" : "Other experience ".repeat(50), attribution: { scope: "GENERAL" } }));
    const model = new MockProvider({ reply: call => { const input = JSON.parse(call.messages[0].content); seen.push(...input.memories.map((row: { id: string }) => row.id)); return { ids: ["0", "invented"] }; } });
    expect(await selectMemoryRows(rows, "containerization", async () => model, undefined, 2000)).toEqual([rows[0]]);
    expect(new Set(seen)).toEqual(new Set(rows.map(row => row.id)));
  });
  it("reports an oversized relevant selection instead of silently dropping facts", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), text: "x".repeat(1000), attribution: {} }));
    const model = new MockProvider({ reply: call => ({ ids: JSON.parse(call.messages[0].content).memories.map((row: { id: string }) => row.id) }) });
    await expect(selectMemoryRows(rows, "everything", async () => model)).rejects.toThrow(/input budget/);
  });
  it("redacts contacts and sends a bounded structured task that can return no claims", async () => {
    const text = redactMemoryInput("I used Docker. Email me at jane@example.com. https://example.com\nDate of birth: private");
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("https://example.com");
    const model = new MockProvider({ reply: () => ({ claims: [] }) });
    expect(await extractMemory(model, { text, previousText: "", context: {}, entries: [], earlier: [] })).toEqual({ claims: [] });
    expect(model.calls[0].json?.name).toBe("candidate_memory");
    expect(model.calls[0].system).toMatch(/Do not infer tools from a JD skill label/);
  });
});
