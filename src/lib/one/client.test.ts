import { createOneConnect } from "@withone/connect/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callOneAction, testOneConnection } from "./client";
import { loadOneSetup, rememberOneConnection } from "./config";

vi.mock("./config", () => ({ loadOneSetup: vi.fn(), rememberOneConnection: vi.fn() }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));

const searchId = "conn_mod_def::GLnP1aajcpM::B9YzjETpQGWIsmbugYJXJQ";
const contentsId = "conn_mod_def::GLnP1SliTjU::cHYbAszDQvC4kJVefjxTMw";
const options = { workflow: "companyResearch" } as const;
const source = { title: "Example", url: "https://example.com/team", text: "Source evidence" };
const reference = `cu_${"a".repeat(64)}`;
const config = {
  clientId: "test-client", clientSecret: "test-client-secret", connectKey: "test-connect-key",
  redirectUri: "http://localhost:3000/api/one/callback", permissionSet: "test-permissions",
};

let revision = 0;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(delay).mockResolvedValue(undefined);
  vi.mocked(loadOneSetup).mockResolvedValue({
    config,
    connect: createOneConnect({ ...config, userStore: { loadUser: async () => reference, saveUser: vi.fn(), clearUser: vi.fn() } }),
    userId: "owner", revision: String(revision++), ciphertext: "encrypted", reference, connectionKey: "exa-test", muapiConnectionKey: "muapi-test",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockMcp(toolResult: unknown, toolHeaders: HeadersInit = {}) {
  const calls: { name: string; arguments: unknown }[] = [];
  const mint = vi.fn();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.endsWith("/connect/token")) {
      mint();
      expect(request.headers.get("x-one-secret")).toBe("test-connect-key");
      expect(request.headers.get("x-one-connect-user-id")).toBe(reference);
      return Response.json({ access_token: "test-token", resource: "https://mcp.withone.ai/mcp", expires_in: 900 });
    }
    expect(request.url).toBe("https://mcp.withone.ai/mcp");
    expect(request.headers.get("authorization")).toBe("Bearer test-token");
    if (request.method === "GET") return new Response(null, { status: 405 });
    const body = await request.json();
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") calls.push(body.params);
    const result = body.method === "initialize" ? {
      protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "test-one", version: "1" },
    } : typeof toolResult === "function" ? toolResult(body.params) : toolResult;
    return Response.json({ jsonrpc: "2.0", id: body.id, result }, {
      headers: body.method === "tools/call" ? toolHeaders : {},
    });
  });
  return { calls, mint };
}

describe("One research tools", () => {
  it("runs both approved actions over MCP, keeping one token and returning only source data", async () => {
    const { calls, mint } = mockMcp({
      structuredContent: { status: 200, responseData: { results: [source, { url: "http://127.0.0.1/" }] }, requestConfig: { private: true } },
      content: [],
    });
    const expected = [{ url: source.url, title: source.title, excerpt: source.text }];
    await expect(callOneAction("searchWeb", { query: " Example " }, options)).resolves.toEqual(expected);
    await expect(callOneAction("readPublicPage", { url: source.url }, options)).resolves.toEqual(expected);
    expect(calls).toEqual([
      { name: "execute_one_action", arguments: { action_id: searchId, connection_key: "exa-test", data: { query: "Example", numResults: 5, contents: { highlights: { maxCharacters: 600 } } } } },
      { name: "execute_one_action", arguments: { action_id: contentsId, connection_key: "exa-test", data: { urls: [source.url], text: { maxCharacters: 6000 } } } },
    ]);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid payloads, unknown actions, and cancellation before reaching One", async () => {
    const { mint } = mockMcp(null);
    await expect(callOneAction("searchWeb", { query: " " }, options)).rejects.toMatchObject({ code: "invalidInput" });
    await expect(callOneAction("readPublicPage", { url: "http://metadata.internal/" }, options)).rejects.toMatchObject({ code: "invalidInput" });
    await expect(callOneAction("execute_one_action" as "searchWeb", { query: "Example" }, options)).rejects.toMatchObject({ code: "forbidden" });
    await expect(callOneAction("searchWeb", { query: "Example" }, { ...options, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "cancelled" });
    expect(mint).not.toHaveBeenCalled();
  });

  it("limits job import to Get Contents with its own text budget", async () => {
    const text = "Job description. ".repeat(3000);
    const { calls } = mockMcp({ structuredContent: { status: 200, responseData: { results: [{ ...source, text }] } }, content: [] });
    const jobImport = { workflow: "jobImport" } as const;
    await expect(callOneAction("searchWeb", { query: "Example" }, jobImport)).rejects.toMatchObject({ code: "forbidden" });
    await expect(callOneAction("readJobPosting", { url: source.url }, options)).rejects.toMatchObject({ code: "forbidden" });
    await expect(callOneAction("readJobPosting", { url: source.url }, jobImport)).resolves.toMatchObject([{ excerpt: text.slice(0, 40_000) }]);
    expect(calls).toEqual([{ name: "execute_one_action", arguments: {
      action_id: contentsId, connection_key: "exa-test", data: { urls: [source.url], text: { maxCharacters: 40_000 }, maxAgeHours: 24, livecrawlTimeout: 8000 },
    } }]);
  });

  it("checks the two specific Exa permissions without running a provider action", async () => {
    const { calls } = mockMcp({ content: [{ type: "text", text: JSON.stringify({ connections: [
      { platform: "exa", key: "allowed-exa", access: { policy: "actions", actions: [{ actionId: searchId }, { actionId: contentsId }] } },
      { platform: "exa", key: "other-exa", access: { policy: "full" } },
    ] }) }] });
    await testOneConnection();
    expect(calls).toEqual([{ name: "list_one_integrations", arguments: {} }]);
    expect(rememberOneConnection).toHaveBeenCalledWith(expect.anything(), "allowed-exa", null);
  });

  it("clears a previously tested connection when the grant is revoked", async () => {
    mockMcp({ isError: true, content: [{ type: "text", text: "That action is outside your grant." }] });
    await expect(testOneConnection()).rejects.toMatchObject({ code: "grant" });
    expect(rememberOneConnection).toHaveBeenCalledWith(expect.anything(), null, null);
  });

  it("handles provider rejection and malformed results with sanitized errors", async () => {
    mockMcp({ structuredContent: { status: 429, responseData: { raw: "private text" } }, content: [] });
    await expect(callOneAction("searchWeb", { query: "Example" }, options)).rejects.toMatchObject({ code: "limits" });
    mockMcp({ content: [{ type: "text", text: "not a JSON result" }] });
    await expect(callOneAction("searchWeb", { query: "Example" }, options)).rejects.toMatchObject({ code: "response" });
  });

  it("rejects oversized tool responses", async () => {
    mockMcp({ content: [] }, { "content-length": String(6 * 1024 * 1024) });
    await expect(callOneAction("searchWeb", { query: "Example" }, options)).rejects.toMatchObject({ code: "response" });
  });
});

it("submits a People-only Muapi search and polls its receipt through the same grant", async () => {
  const search = "conn_mod_def::GOHdX1CyCBU::T_Nu4bvYTbGwFLYxVGqj8Q";
  const result = "conn_mod_def::GOHdamPqmxs::eECm4QguSUiKIiQ6pCW4vg";
  const { calls } = mockMcp(({ arguments: args }: { arguments: { action_id: string } }) => ({
    structuredContent: {
      status: 200,
      responseData: args.action_id === search
        ? { request_id: "lookup-1", status: "processing" }
        : { status: "completed", outputs: { people: [
          { name: "Maya Rao", title: "Design Director", company: "Ledgerly", profile_url: "https://www.linkedin.com/in/maya/?tracking=1" },
          { name: "Not a profile", title: "Design Director", profile_url: "https://elsewhere.example/in/maya" },
        ] } },
    },
    content: [],
  }));
  const input = { company: "Ledgerly", title: "Design Director" };
  await expect(callOneAction("searchLinkedInPeople", input, options)).rejects.toMatchObject({ code: "forbidden" });
  await expect(callOneAction("searchLinkedInPeople", input, { workflow: "peopleResearch", jobId: "job-1" }))
    .resolves.toEqual([{ url: "https://www.linkedin.com/in/maya", title: "Maya Rao", excerpt: "Maya Rao · Design Director · Ledgerly" }]);
  expect(calls).toEqual([
    { name: "execute_one_action", arguments: { action_id: search, connection_key: "muapi-test", data: { ...input, idempotency_key: expect.stringMatching(/^[a-f0-9]{64}$/) } } },
    { name: "execute_one_action", arguments: { action_id: result, connection_key: "muapi-test", path_variables: { id: "lookup-1" } } },
  ]);
});

it("looks up a company by domain using the existing prediction result action", async () => {
  const companyId = "conn_mod_def::GOHdXoYEkLA::ATjYX7nISQy4lx8Y5_LmpA";
  const resultId = "conn_mod_def::GOHdamPqmxs::eECm4QguSUiKIiQ6pCW4vg";
  let polls = 0;
  const { calls } = mockMcp(({ arguments: args }: { arguments: { action_id: string } }) => ({
    structuredContent: {
      status: 200,
      responseData: args.action_id === companyId
        ? { request_id: "company-lookup-1" }
        : ++polls < 8 ? { status: "pending" } : { status: "completed", outputs: [JSON.stringify({ name: "Ledgerly", linkedin_url: null, industry: null, headquarters: "Amsterdam" })] },
    },
    content: [],
  }));
  const peopleOptions = { workflow: "peopleResearch" } as const;
  await expect(callOneAction("lookupLinkedInCompany", { companyIdentifier: "ledgerly.internal" }, peopleOptions))
    .rejects.toMatchObject({ code: "invalidInput" });
  await expect(callOneAction("lookupLinkedInCompany", { companyIdentifier: "ledgerly.com" }, options))
    .rejects.toMatchObject({ code: "forbidden" });
  await expect(callOneAction("lookupLinkedInCompany", { companyIdentifier: "Ledgerly.com" }, peopleOptions))
    .resolves.toEqual([{ url: "https://ledgerly.com", title: "Ledgerly", excerpt: "Ledgerly · Amsterdam" }]);
  expect(calls.map((call) => call.arguments)).toEqual([
    { action_id: companyId, connection_key: "muapi-test", data: { domain: "ledgerly.com" } },
    ...Array.from({ length: 8 }, () => ({ action_id: resultId, connection_key: "muapi-test", path_variables: { id: "company-lookup-1" } })),
  ]);
});
import { setTimeout as delay } from "node:timers/promises";


it("normalizes Muapi's live people response and keeps employer evidence in the headline", async () => {
  const rows = [
    { full_name: "Maya Rao", title: "Design Recruiter at Ledgerly", company_name: null, linkedin_url: "https://www.linkedin.com/in/maya" },
    { full_name: "Arjun Roy", title: "Design Lead", company_name: "Ledgerly", linkedin_url: "https://www.linkedin.com/in/arjun" },
  ];
  mockMcp(({ arguments: args }: { arguments: { path_variables?: unknown } }) => ({
    structuredContent: { status: 200, responseData: args.path_variables
      ? { status: "completed", outputs: [JSON.stringify(rows)] }
      : { request_id: "lookup-2" } },
    content: [],
  }));
  await expect(callOneAction("searchLinkedInPeople", { company: "Ledgerly", title: "Design" }, { workflow: "peopleResearch" })).resolves.toEqual([
    { url: rows[0].linkedin_url, title: "Maya Rao", excerpt: "Maya Rao · Design Recruiter at Ledgerly" },
    { url: rows[1].linkedin_url, title: "Arjun Roy", excerpt: "Arjun Roy · Design Lead · Ledgerly" },
  ]);
});

it.each(["timeout", "cancelled"])("stops polling on %s without repeating the paid submission", async (code) => {
  const { calls } = mockMcp({ structuredContent: { status: 200, responseData: { request_id: "lookup-3" } }, content: [] });
  const deadline = new AbortController();
  const caller = new AbortController();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => ms === 15_000 ? deadline.signal : timeout(ms));
  vi.mocked(delay).mockImplementation(async (_ms, _value, options) => {
    (code === "timeout" ? deadline : caller).abort();
    options?.signal?.throwIfAborted();
  });
  await expect(callOneAction("searchLinkedInPeople", { company: "Ledgerly", title: "Design" }, { workflow: "peopleResearch", signal: caller.signal }))
    .rejects.toMatchObject({ code });
  expect(calls).toHaveLength(1);
});
