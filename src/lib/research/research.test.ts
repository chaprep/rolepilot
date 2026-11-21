import { afterEach, expect, it, vi } from "vitest";

import { guardCoverLetter, factSources } from "@/lib/ai/fact-guard";
import type { ToolTurn, ToolTurnRequest } from "@/lib/ai/provider";
import { MockProvider } from "@/lib/ai/providers/mock";
import { json, stubFetch } from "@/lib/ai/test-http";

import { researchCompany, researchFingerprint, reuseResearch } from ".";
import { companyResearchSchema, savedCompanyResearch } from "./schema";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));
const input = { company: "Ledgerly", role: "Designer", website: "https://ledgerly.com", jobContext: "Design for transaction workflows. Recruiter: test@example.com." };
const excerpt = "Ledgerly supports teams in 22 countries.";
const answer = JSON.stringify({ identity: { name: "Ledgerly", sourceId: "S1" }, findings: [{ sourceId: "S1", text: excerpt, excerpt }] });
const page = { url: "https://ledgerly.com/", browserHtml: `<title>Ledgerly</title><main>${excerpt}</main>` };
const read = (id = "read", url = page.url) => ({ id, name: "readPage", arguments: JSON.stringify({ url }) });
const search = (id = "search", query = "Ledgerly design teams") => ({ id, name: "searchWeb", arguments: JSON.stringify({ query }) });
const model = (toolTurn: (request: ToolTurnRequest) => Promise<ToolTurn>) => Object.assign(new MockProvider({ reply: () => "" }), { toolTurn });
const reply = (...calls: ToolTurn["calls"]): ToolTurn => ({ text: "", calls });
const summarize = () => ({ text: answer, calls: [] });
const apiKey = "mockzyte";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("lets the AI follow search leads and accepts only exact excerpts from retrieved pages", async () => {
  const http = stubFetch(({ url }) => url.pathname.endsWith("search")
    ? json({ status: "success", organicResults: [{ title: "Ledgerly", url: page.url, snippet: "Ledgerly acquired an unknown company" }] })
    : json(page));
  const toolTurn = vi.fn()
    .mockResolvedValueOnce(reply(search(), { id: "bad", name: "readPage", arguments: "{bad" }))
    .mockResolvedValueOnce(reply(read(), read("duplicate", `${page.url}#team`)))
    .mockResolvedValueOnce({
      text: JSON.stringify({ ...JSON.parse(answer), findings: [...JSON.parse(answer).findings,
        { text: "Invented.", excerpt: "Ledgerly acquired an unknown company", sourceId: "S1" },
        { text: "From a search.", excerpt, sourceId: "S2" },
        { text: "Ledgerly operates in 95 countries.", excerpt, sourceId: "S1" },
      ] }),
      calls: [],
    });
  const progress = vi.fn();
  const result = companyResearchSchema.parse(await researchCompany(input, { provider: model(toolTurn), apiKey, progress }));
  expect(progress).toHaveBeenCalledWith("Researching the company");
  expect(result).toMatchObject({ status: "partial", warning: "invalid-response", requests: { search: 1, extract: 1 }, findings: [{ text: excerpt, sourceId: "S1", excerpt }] });
  expect(result.sources).toEqual([{ id: "S1", url: page.url, title: "Ledgerly", retrievedAt: expect.any(String) }]);
  expect(http).toHaveLength(2);
  expect(JSON.stringify(http)).not.toContain("test@example.com");
  expect(JSON.stringify(toolTurn.mock.calls[0][0].messages[0])).not.toContain("test@example.com");
  const messages = toolTurn.mock.calls[2][0].messages;
  expect(messages).toContainEqual(expect.objectContaining({ role: "tool", callId: "bad", content: '{"error":"invalid-arguments"}' }));
  expect(messages).toContainEqual(expect.objectContaining({ role: "tool", callId: "duplicate", content: '{"error":"already-read"}' }));
});

it("keeps the request budget across failed calls and retries and uses tools sequentially", async () => {
  let inFlight = 0;
  const http = stubFetch(async ({ url, body }) => {
    expect(inFlight++).toBe(0);
    await Promise.resolve();
    inFlight--;
    return url.pathname.endsWith("search")
      ? json({}, { status: 429 })
      : json({ ...page, url: (body as { url: string }).url });
  });
  const toolTurn = vi.fn()
    .mockResolvedValueOnce(reply(
      ...Array.from({ length: 5 }, (_, index) => search(`search-${index}`, `Ledgerly design ${index}`)),
      ...Array.from({ length: 7 }, (_, index) => read(`read-${index}`, `https://ledgerly.com/page/${index}`)),
    ))
    .mockResolvedValueOnce(summarize());
  const result = await researchCompany(input, { provider: model(toolTurn), apiKey });
  expect(result).toMatchObject({ status: "partial", warning: "rate-limit", requests: { search: 3, extract: 5 } });
  expect(http).toHaveLength(8);
  expect(toolTurn.mock.calls[1][0].allowTools).toBe(false);
});

it("bounds accumulated tool output and offers a single summary turn after ten turns", async () => {
  stubFetch(({ body }) => json({ ...page, url: (body as { url: string }).url, browserHtml: `<main>${excerpt} ${"x".repeat(16_000)}</main>` }));
  const bulky = vi.fn()
    .mockResolvedValueOnce(reply(...Array.from({ length: 5 }, (_, index) => read(`r${index}`, `https://ledgerly.com/${index}`))))
    .mockResolvedValueOnce(summarize());
  const result = await researchCompany(input, { provider: model(bulky), apiKey });
  expect(result.findings).toHaveLength(1);
  const messages: ToolTurnRequest["messages"] = bulky.mock.calls[1][0].messages;
  expect(messages.reduce((size, message) => size + (message.role === "tool" ? message.content.length : 0), 0)).toBeLessThanOrEqual(60_000);

  const loop = vi.fn(async ({ allowTools }: ToolTurnRequest) => allowTools
    ? reply({ id: "bad", name: "inventedTool", arguments: "{}" })
    : summarize());
  await researchCompany(input, { provider: model(loop), apiKey });
  expect(loop).toHaveBeenCalledTimes(11);
  expect(loop.mock.calls[10][0].allowTools).toBe(false);
});

it("preserves verified findings on deadline and propagates parent cancellation", async () => {
  const deadline = new AbortController();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => ms === 120_000 ? deadline.signal : timeout(ms));
  stubFetch(() => json(page));
  const toolTurn = vi.fn()
    .mockResolvedValueOnce(reply(read()))
    .mockResolvedValueOnce({ text: answer, calls: [{ id: "other", name: "unknown", arguments: "{}" }] })
    .mockImplementationOnce(async () => {
      deadline.abort(new DOMException("Timed out", "TimeoutError"));
      throw deadline.signal.reason;
    });
  await expect(researchCompany(input, { provider: model(toolTurn), apiKey })).resolves.toMatchObject({ status: "partial", warning: "deadline", findings: [{ text: excerpt }] });

  const parent = new AbortController();
  parent.abort(new Error("Cancelled by user"));
  await expect(researchCompany(input, { provider: model(toolTurn), apiKey, signal: parent.signal })).rejects.toThrow("Cancelled by user");
});

it("keeps ambiguous, unsupported, missing-key, and unretrieved research out of writing", async () => {
  const requests = stubFetch(() => json(page));
  const ambiguous = vi.fn().mockResolvedValueOnce(reply(read())).mockResolvedValueOnce({ text: '{"identity":null,"findings":[]}', calls: [] });
  await expect(researchCompany(input, { provider: model(ambiguous), apiKey })).resolves.toMatchObject({ status: "unavailable", warning: "unverified-company", findings: [] });
  await expect(researchCompany(input, { provider: model(async () => summarize()), apiKey })).resolves.toMatchObject({ status: "unavailable", findings: [] });
  await expect(researchCompany(input, { provider: new MockProvider({ reply: () => "" }), apiKey })).resolves.toMatchObject({ warning: "unsupported-provider" });
  await expect(researchCompany(input, { provider: model(async () => summarize()), apiKey: null })).resolves.toMatchObject({ warning: "missing-key" });
  expect(requests).toHaveLength(1);
});

it("reuses only fresh, matching, useful research and keeps candidate claims independently checked", async () => {
  stubFetch(() => json(page));
  const toolTurn = vi.fn().mockResolvedValueOnce({ text: '{"identity":null,"findings":[]}', calls: [read()] }).mockResolvedValueOnce(summarize());
  const result = await researchCompany(input, { provider: model(toolTurn), apiKey });
  expect(result.status).toBe("complete");
  expect(researchFingerprint({ ...input, company: "  ledgerly ", role: "DESIGNER" })).toBe(result.fingerprint);
  expect(reuseResearch(input, result)).toEqual(result);
  expect(savedCompanyResearch({ ...result, sources: [{ ...result.sources[0], url: "invalid" }] })).toBeUndefined();
  expect(reuseResearch({ ...input, role: "Engineer" }, result)).toBeUndefined();
  expect(reuseResearch({ ...input, jobContext: "New posting details" }, result)).toBeUndefined();
  expect(reuseResearch(input, { ...result, finishedAt: "2020-01-01T00:00:00.000Z" })).toBeUndefined();
  const text = `${excerpt} I worked with Ledgerly in 22 countries.`;
  const flags = guardCoverLetter([{ id: "paragraph:1", label: "Opening", text }], factSources(["Ledgerly"]), "Jane Applicant", result);
  expect(flags).toEqual([{ id: "paragraph:1", label: "Opening", text, unverified: ["22"] }]);
  expect(guardCoverLetter([{ id: "p", label: "Opening", text: excerpt }], factSources(["Ledgerly"]), "Jane Applicant", result)[0].unverified).toBeUndefined();
});
