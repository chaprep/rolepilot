import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { Client, SdkHttpError, StreamableHTTPClientTransport, UnauthorizedError, type CallToolResult } from "@modelcontextprotocol/client";
import { z } from "zod";

import { boundedResponse, ResponseTooLarge } from "@/lib/bounded-response";
import { logServerWarning } from "@/lib/log";

import { loadOneSetup, rememberOneConnection } from "./config";

const MCP_URL = "https://mcp.withone.ai/mcp";
const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_LEEWAY_MS = 60_000;
const EXA_CONTENTS = "conn_mod_def::GLnP1SliTjU::cHYbAszDQvC4kJVefjxTMw";
const JOB_TEXT_LIMIT = 40_000;

const EXA_ACTIONS = {
  searchWeb: {
    id: "conn_mod_def::GLnP1aajcpM::B9YzjETpQGWIsmbugYJXJQ",
    input: z.strictObject({ query: z.string().trim().min(1).max(300) }).transform(({ query }) => ({
      query, numResults: 5, contents: { highlights: { maxCharacters: 600 } },
    })),
  },
  readPublicPage: {
    id: EXA_CONTENTS,
    input: z.strictObject({ url: z.string().max(2048).refine(isPublicWebUrl) }).transform(({ url }) => ({
      urls: [url], text: { maxCharacters: 6000 },
    })),
  },
};

const peopleInput = z.strictObject({
  company: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160).optional(),
  query: z.string().trim().min(1).max(240).optional(),
}).refine(({ title, query }) => Boolean(title || query));

const MUAPI_SEARCH = "conn_mod_def::GOHdX1CyCBU::T_Nu4bvYTbGwFLYxVGqj8Q";
const MUAPI_COMPANY = "conn_mod_def::GOHdXoYEkLA::ATjYX7nISQy4lx8Y5_LmpA";
const MUAPI_RESULT = "conn_mod_def::GOHdamPqmxs::eECm4QguSUiKIiQ6pCW4vg";
export const companyLookupInput = z.strictObject({
  companyIdentifier: z.string().trim().min(1).max(253).refine((value) => Boolean(linkedinCompanyUrl(value) || isCompanyDomain(value))),
});
const ACTIONS = {
  ...EXA_ACTIONS,
  readJobPosting: {
    id: EXA_CONTENTS,
    input: z.strictObject({ url: z.string().max(2048).refine(isPublicWebUrl) }).transform(({ url }) => ({
      urls: [url], text: { maxCharacters: JOB_TEXT_LIMIT }, maxAgeHours: 24, livecrawlTimeout: 8000,
    })),
  },
  searchLinkedInPeople: { id: MUAPI_SEARCH, input: peopleInput },
  lookupLinkedInCompany: { id: MUAPI_COMPANY, input: companyLookupInput },
};
type Action = keyof typeof ACTIONS;
type Setup = NonNullable<Awaited<ReturnType<typeof loadOneSetup>>>;
type ToolArgs = Record<string, unknown>;

const problems = {
  notConfigured: "Save the One credentials in Settings → AI first.",
  notConnected: "Connect with One in Settings → AI first.",
  notTested: "Test the One connection in Settings → AI first.",
  invalidInput: "This One action received invalid input.",
  forbidden: "This workflow cannot run that One action.",
  grant: "One did not authorize this action. Check the grant or reconnect in Settings → AI.",
  providerAuth: "The connected service rejected its credentials. Check the connection in One.",
  limits: "One or its connected service reached a usage limit. Check the connection in One.",
  unavailable: "One or its connected service could not complete this action.",
  timeout: "The One action timed out.",
  cancelled: "The One action was cancelled.",
  response: "One returned an unexpected response.",
  muapi: "Authorize LinkedIn People Search and Get a Prediction’s Result for one Muapi connection in One, then test again.",
  exa: "Authorize exactly one Exa connection with the Search and Get Contents actions, then test again.",
} as const;

export class OneActionError extends Error {
  override name = "OneActionError";
  constructor(readonly code: keyof typeof problems) {
    super(problems[code]);
  }
}

// The provider fetches the page. Keep the input constrained to ordinary public
// URLs, and apply the same check to links returned to the workflow.
export function isPublicWebUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username && !url.password && !url.port
      && host.includes(".") && isIP(host) === 0 && !/\.(localhost|local|internal|test|invalid|onion)$/.test(host);
  } catch {
    return false;
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  resource: z.literal(MCP_URL),
});
let cachedToken: { setup: string; reference: string; token: string; expiresAt: number } | undefined;

async function accessToken(setup: Setup, signal: AbortSignal) {
  if (!setup.reference) throw new OneActionError("notConnected");
  if (cachedToken?.setup === setup.revision && cachedToken.reference === setup.reference && cachedToken.expiresAt > Date.now() + TOKEN_LEEWAY_MS) {
    return cachedToken.token;
  }
  // The installed Connect SDK handles consent and grant storage. Its published
  // version predates getMcpToken, so use One's documented mint endpoint.
  const userId = await setup.connect.getConnectUserId(setup.userId);
  if (!userId) throw new OneActionError("notConnected");
  const response = await fetch("https://mcp.withone.ai/connect/token", {
    method: "POST",
    headers: { "X-One-Secret": setup.config.connectKey, "X-One-Connect-User-Id": userId },
    signal,
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new OneActionError(statusProblem(response.status, "grant"));
  const parsed = tokenSchema.safeParse(await boundedResponse(response).json());
  if (!parsed.success) throw new OneActionError("response");
  cachedToken = {
    setup: setup.revision,
    reference: setup.reference,
    token: parsed.data.access_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };
  return cachedToken.token;
}

function statusProblem(status: number, authProblem: "grant" | "providerAuth"): keyof typeof problems {
  if (status === 401 || status === 403) return authProblem;
  if (status === 402 || status === 429) return "limits";
  if (status === 408 || status === 504) return "timeout";
  return "unavailable";
}

function parseToolResult(result: CallToolResult): unknown {
  if (result.isError) {
    const text = result.content?.find((block) => block.type === "text")?.text ?? "";
    if (/rate.limit|plan limit|quota|credits/i.test(text)) throw new OneActionError("limits");
    if (/grant|scope|unauthorized|not authorized|forbidden|permission|denied/i.test(text)) throw new OneActionError("grant");
    if (/timed?\s*out|timeout/i.test(text)) throw new OneActionError("timeout");
    throw new OneActionError("unavailable");
  }
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new OneActionError("response");
  return JSON.parse(text);
}

async function callMcp(setup: Setup, name: "execute_one_action" | "list_one_integrations", args: ToolArgs, callerSignal?: AbortSignal) {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = callerSignal ? AbortSignal.any([deadline, callerSignal]) : deadline;
  const client = new Client({ name: "rolepilot", version: "1" }, { versionNegotiation: { mode: "legacy" } });
  try {
    signal.throwIfAborted();
    const token = await accessToken(setup, signal);
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store" },
      fetch: async (input, init) => boundedResponse(await fetch(input, init)),
    });
    await client.connect(transport, { signal });
    return parseToolResult(await client.callTool({ name, arguments: args }, { signal }));
  } catch (error) {
    if (callerSignal?.aborted) throw new OneActionError("cancelled");
    if (deadline.aborted) throw new OneActionError("timeout");
    if (error instanceof OneActionError) throw error;
    if (error instanceof UnauthorizedError || (error instanceof SdkHttpError && [401, 403].includes(error.status))) {
      if (cachedToken?.setup === setup.revision && cachedToken.reference === setup.reference) cachedToken = undefined;
      throw new OneActionError("grant");
    }
    if (error instanceof SdkHttpError) throw new OneActionError(statusProblem(error.status, "grant"));
    if (error instanceof SyntaxError || error instanceof ResponseTooLarge) throw new OneActionError("response");
    throw new OneActionError("unavailable");
  } finally {
    await client.close().catch(() => undefined);
  }
}

const connectionList = z.object({
  connections: z.array(z.object({
    platform: z.string(),
    key: z.string().min(1),
    viewerAccessLevel: z.string().optional(),
    access: z.object({ policy: z.string(), actions: z.array(z.object({ actionId: z.string() })).optional() }),
  })),
});

export async function testOneConnection() {
  const setup = await loadOneSetup();
  if (!setup) throw new OneActionError("notConfigured");
  let response: unknown;
  try {
    response = await callMcp(setup, "list_one_integrations", {});
  } catch (error) {
    if ((setup.connectionKey || setup.muapiConnectionKey) && error instanceof OneActionError && error.code === "grant") await rememberOneConnection(setup, null, null);
    throw error;
  }
  const result = connectionList.safeParse(response);
  if (!result.success) throw new OneActionError("response");

  const keyFor = (platform: string, ids: string[]) => {
    const matches = result.data.connections.filter((connection) =>
      connection.platform === platform && connection.viewerAccessLevel !== "none"
      && connection.access.policy === "actions"
      && ids.every((id) => connection.access.actions?.some(({ actionId }) => actionId === id))
    );
    return matches.length === 1 ? matches[0].key : null;
  };
  const connectionKey = keyFor("exa", Object.values(EXA_ACTIONS).map(({ id }) => id));
  const muapiKey = keyFor("muapi", [MUAPI_SEARCH, MUAPI_RESULT]);
  await rememberOneConnection(setup, connectionKey, muapiKey);
  if (!connectionKey) throw new OneActionError("exa");
}

const actionResponse = z.object({ status: z.number().int(), responseData: z.unknown() });
const pages = z.object({
  requestId: z.string().optional(),
  results: z.array(z.object({
    title: z.string().nullish(),
    url: z.string(),
    text: z.string().nullish(),
    highlights: z.array(z.string()).nullish(),
  })),
});

export type OneSource = { url: string; title: string; excerpt: string };

async function executeAction(setup: Setup, args: ToolArgs, signal?: AbortSignal) {
  const result = actionResponse.safeParse(await callMcp(setup, "execute_one_action", args, signal));
  if (!result.success) throw new OneActionError("response");
  if (result.data.status < 200 || result.data.status >= 300) {
    throw new OneActionError(statusProblem(result.data.status, "providerAuth"));
  }
  return result.data.responseData;
}

const receiptSchema = z.object({ request_id: z.string().regex(/^[\w.-]{1,128}$/) });
const predictionSchema = z.object({
  status: z.enum(["queued", "pending", "processing", "completed", "failed", "cancelled"]),
  outputs: z.unknown().optional(),
  output: z.unknown().optional(),
});
const personName = z.string().trim().min(1).max(160).nullish();
const personSchema = z.object({
  name: personName,
  full_name: personName,
  title: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).nullish(),
  company_name: z.string().trim().max(160).nullish(),
  profile_url: z.string().max(2048).optional(),
  linkedin_url: z.string().max(2048).optional(),
  url: z.string().max(2048).optional(),
});

function decodePrediction(output: unknown): unknown {
  if (Array.isArray(output) && output.length === 1 && typeof output[0] === "string") output = output[0];
  if (typeof output === "string" && output.length <= 32_000) {
    try { output = JSON.parse(output); } catch { throw new OneActionError("response"); }
  }
  return output;
}

function readPeople(output: unknown): OneSource[] {
  output = decodePrediction(output);
  const payload = z.object({ people: z.array(z.unknown()) }).safeParse(output);
  const rows = Array.isArray(output) ? output : payload.success ? payload.data.people : null;
  if (!rows) throw new OneActionError("response");
  const sources = rows.slice(0, 10).flatMap((row) => {
    const result = personSchema.safeParse(row);
    if (!result.success) return [];
    const { name, full_name, title, company, company_name, profile_url, linkedin_url, url } = result.data;
    const displayName = full_name ?? name;
    const profile = linkedinProfileUrl(profile_url ?? linkedin_url ?? url ?? "");
    if (!profile || !displayName) return [];
    return [{ url: profile, title: displayName, excerpt: [displayName, title, company_name ?? company].filter(Boolean).join(" · ") }];
  });
  if (rows.length && !sources.length) throw new OneActionError("response");
  return sources;
}

export function linkedinProfileUrl(value: string) {
  if (!isPublicWebUrl(value)) return null;
  const url = new URL(value);
  if (!/^(?:[a-z]{2}\.|www\.)?linkedin\.com$/i.test(url.hostname) || !/^\/in\/[^/]+\/?$/i.test(url.pathname)) return null;
  return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
}

function linkedinCompanyUrl(value: string) {
  if (!isPublicWebUrl(value)) return null;
  const url = new URL(value);
  if (!/^(?:[a-z]{2}\.|www\.)?linkedin\.com$/i.test(url.hostname) || !/^\/company\/[\w-]+\/?$/i.test(url.pathname)) return null;
  return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
}

function isCompanyDomain(value: string) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)
    && isPublicWebUrl(`https://${value}`) && !/(^|\.)linkedin\.com$/i.test(value);
}

const companySchema = z.object({
  name: z.string().trim().min(1).max(160),
  linkedin_url: z.string().max(2048).nullish(),
  description: z.string().nullish(),
  industry: z.string().nullish(),
  headquarters: z.string().nullish(),
});

async function lookupCompany(setup: Setup, { companyIdentifier }: z.infer<typeof companyLookupInput>, jobId?: string, signal?: AbortSignal) {
  const linkedinUrl = linkedinCompanyUrl(companyIdentifier);
  const input = linkedinUrl ? { linkedin_url: linkedinUrl } : { domain: companyIdentifier.toLowerCase() };
  const output = decodePrediction(await runMuapiPrediction(setup, MUAPI_COMPANY, input, jobId, signal));
  const result = companySchema.safeParse(output);
  if (!result.success) throw new OneActionError("response");
  const company = result.data;
  const url = linkedinCompanyUrl(company.linkedin_url ?? "") ?? linkedinUrl ?? `https://${companyIdentifier.toLowerCase()}`;
  return [{ url, title: company.name, excerpt: [company.name, company.industry, company.headquarters, company.description].filter(Boolean).join(" · ").slice(0, 900) }];
}

async function runMuapiPrediction(setup: Setup, actionId: string, input: object, jobId: string | undefined, signal?: AbortSignal) {
  const connectionKey = setup.muapiConnectionKey;
  if (!connectionKey) throw new OneActionError("muapi");
  const deadline = AbortSignal.timeout(actionId === MUAPI_COMPANY ? 50_000 : 15_000);
  const predictionSignal = signal ? AbortSignal.any([deadline, signal]) : deadline;
  const idempotencyKey = jobId && createHash("sha256").update(JSON.stringify([jobId, actionId, input])).digest("hex");
  try {
    const receipt = receiptSchema.safeParse(await executeAction(setup, {
      action_id: actionId,
      connection_key: connectionKey,
      data: { ...input, ...(idempotencyKey && { idempotency_key: idempotencyKey }) },
    }, predictionSignal));
    if (!receipt.success) throw new OneActionError("response");
    for (const wait of [500, 1_000, 2_000, 4_000, 6_000, 8_000, 10_000, 10_000, 4_000]) {
      await delay(wait, undefined, { signal: predictionSignal });
      const prediction = predictionSchema.safeParse(await executeAction(setup, {
        action_id: MUAPI_RESULT,
        connection_key: connectionKey,
        path_variables: { id: receipt.data.request_id },
      }, predictionSignal));
      if (!prediction.success) throw new OneActionError("response");
      const { status, output, outputs } = prediction.data;
      if (status === "completed") return outputs ?? output;
      if (status === "failed" || status === "cancelled") throw new OneActionError("unavailable");
    }
  } catch (error) {
    if (deadline.aborted && !signal?.aborted) throw new OneActionError("timeout");
    throw error;
  }
  throw new OneActionError("timeout");
}

export async function callOneAction<K extends Action>(
  action: K,
  input: z.input<(typeof ACTIONS)[K]["input"]>,
  { workflow, signal, jobId }: { workflow: "companyResearch" | "peopleResearch" | "jobImport"; signal?: AbortSignal; jobId?: string },
): Promise<OneSource[]> {
  if (!Object.hasOwn(ACTIONS, action) || (workflow === "jobImport") !== (action === "readJobPosting")
    || (workflow === "companyResearch" && !Object.hasOwn(EXA_ACTIONS, action))) {
    throw new OneActionError("forbidden");
  }
  if (signal?.aborted) throw new OneActionError("cancelled");
  const definition = ACTIONS[action];
  const parsed = definition.input.safeParse(input);
  if (!parsed.success) throw new OneActionError("invalidInput");

  const started = performance.now();
  try {
    const setup = await loadOneSetup();
    if (!setup) throw new OneActionError("notConfigured");
    if (!setup.reference) throw new OneActionError("notConnected");
    if ("companyIdentifier" in parsed.data) return await lookupCompany(setup, parsed.data, jobId, signal);
    if (action === "searchLinkedInPeople") return readPeople(await runMuapiPrediction(setup, MUAPI_SEARCH, parsed.data, jobId, signal));
    if (!setup.connectionKey) throw new OneActionError("notTested");

    const output = pages.safeParse(await executeAction(setup, {
      action_id: definition.id,
      connection_key: setup.connectionKey,
      data: parsed.data,
    }, signal));
    if (!output.success) throw new OneActionError("response");

    const excerptLimit = action === "readJobPosting" ? JOB_TEXT_LIMIT : action === "searchWeb" ? 600 : 6000;
    const sources = output.data.results.filter(({ url }) => isPublicWebUrl(url)).slice(0, action === "searchWeb" ? 5 : 1).map((page) => ({
      url: page.url,
      title: (page.title ?? "").slice(0, 200),
      excerpt: (page.text || (action === "readJobPosting" ? "" : page.highlights?.join("\n")) || "").slice(0, excerptLimit),
    }));
    const requestId = output.data.requestId;
    const trace = requestId && /^[\w.-]{1,128}$/.test(requestId) ? ` (request ${requestId})` : "";
    console.info(`[one] ${action} ok in ${Math.round(performance.now() - started)} ms${trace}`);
    return sources;
  } catch (error) {
    const failure = error instanceof OneActionError ? error : new OneActionError(signal?.aborted ? "cancelled" : "unavailable");
    logServerWarning("one", `${action} ${failure.code} after ${Math.round(performance.now() - started)} ms`);
    throw failure;
  }
}
