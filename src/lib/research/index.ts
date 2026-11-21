import "server-only";

import { createHash } from "node:crypto";

import { toJSONSchema, z } from "zod";

import { factSources, unverifiedFacts } from "@/lib/ai/fact-guard";
import type { AIProvider, ToolDefinition, ToolMessage } from "@/lib/ai/provider";
import { validateJson } from "@/lib/ai/provider";
import { COMPANY_RESEARCH_INSTRUCTIONS, COMPANY_RESEARCH_VERSION } from "@/lib/ai/tasks/prompt-parts";
import { RESEARCH_STEP } from "@/lib/jobs/application-steps";
import { logServerWarning } from "@/lib/log";

import { researchAnswerSchema, savedCompanyResearch, type CompanyResearch, type ResearchWarning } from "./schema";
import { publicWebUrl, readPage, REQUEST_LIMITS, ResearchError, searchWeb, type PageContent } from "./zyte";

export { readPage, searchWeb } from "./zyte";
export type { PageContent, SearchResult } from "./zyte";
export type { CompanyResearch } from "./schema";

const DEADLINE_MS = 120_000;
const MAX_TURNS = 10;
const MAX_TOOL_CHARACTERS = 60_000;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type ResearchInput = { company: string; role: string; website?: string; jobContext: string; contextRevision?: string };
type Options = { provider: AIProvider; apiKey: string | null; signal?: AbortSignal; progress?: (step: string) => void | Promise<void> };

const params = {
  searchWeb: z.strictObject({ query: z.string().trim().min(1).max(250) }),
  readPage: z.strictObject({ url: z.string().max(2048) }),
};
const tools: ToolDefinition[] = [
  { name: "searchWeb", description: "Search for public company and role information.", parameters: toJSONSchema(params.searchWeb, { target: "draft-7" }) },
  { name: "readPage", description: "Read a public webpage and its links. Retrieved text comes with a source ID.", parameters: toJSONSchema(params.readPage, { target: "draft-7" }) },
];

const tidy = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
const normalize = (value: string) => tidy(value).toLowerCase();
const words = (value: string) => ` ${normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

export function researchFingerprint(input: ResearchInput): string {
  return createHash("sha256").update(JSON.stringify([
    COMPANY_RESEARCH_VERSION, normalize(input.company), normalize(input.role),
    input.website ? publicWebUrl(input.website)?.href ?? "" : "", normalize(input.jobContext), input.contextRevision ?? "",
  ])).digest("hex");
}

function matchingResearch(input: ResearchInput, value: unknown): CompanyResearch | undefined {
  const saved = savedCompanyResearch(value);
  if (saved?.fingerprint === researchFingerprint(input) && saved.findings.length) return saved;
}

export function reuseResearch(input: ResearchInput, value: unknown): CompanyResearch | undefined {
  const saved = matchingResearch(input, value);
  if (!saved) return;
  const age = Date.now() - Date.parse(saved.finishedAt);
  if (age >= 0 && age < FRESH_MS) {
    logServerWarning("Company research", JSON.stringify({ cacheReuse: true, durationMs: 0, requests: { search: 0, extract: 0 }, warning: saved.warning }));
    return saved;
  }
}

function cleanJobText(value: string): string {
  return tidy(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/\+?\d(?:[\d(). -]*\d){6,}/g, "")
    .replace(/https?:\/\/\S+/gi, "");
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export async function researchCompany(input: ResearchInput, options: Options): Promise<CompanyResearch> {
  options.signal?.throwIfAborted();
  const startedAt = new Date().toISOString();
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const signal = AbortSignal.any([deadline, ...(options.signal ? [options.signal] : [])]);
  const requests = { search: 0, extract: 0 };
  const webOptions = {
    apiKey: options.apiKey ?? "", signal, onRequest(kind: keyof typeof requests) {
      if (requests[kind] >= REQUEST_LIMITS[kind]) throw new ResearchError("budget");
      requests[kind]++;
    },
  };
  const pages = new Map<string, PageContent>();
  const visited = new Set<string>();
  const queries = new Set<string>();
  let contentLength = 0;
  let best: z.infer<typeof researchAnswerSchema> = { identity: null, findings: [] };
  let warning: ResearchWarning | null = null;
  let finished = false;

  const website = input.website && publicWebUrl(input.website);
  if (website) website.search = "";
  const context = {
    company: cleanJobText(input.company).slice(0, 240),
    role: cleanJobText(input.role).slice(0, 240),
    website: website ? website.href : undefined,
    jobContext: cleanJobText(input.jobContext).slice(0, 3500),
  };
  const system = `${COMPANY_RESEARCH_INSTRUCTIONS}\nJSON schema: ${JSON.stringify(toJSONSchema(researchAnswerSchema))}`;
  const messages: ToolMessage[] = [{ role: "user", content: JSON.stringify(context) }];

  function accept(text: string, final: boolean): boolean {
    const answer = validateJson(text, researchAnswerSchema);
    if (!answer.ok) {
      if (final && pages.size) warning ??= "invalid-response";
      return false;
    }
    const { identity, findings } = answer.data;
    const identityPage = identity && pages.get(identity.sourceId);
    const expected = words(context.company);
    if (!identity || !identityPage || !expected.trim() || !words(identity.name).includes(expected)
      || !words(`${identityPage.title} ${identityPage.text}`).includes(expected)) {
      // A final identification supersedes provisional findings.
      if (final) {
        best = { identity: null, findings: [] };
        warning = "unverified-company";
      }
      return false;
    }
    if (website) {
      const host = hostOf(identityPage.url);
      const expectedHost = hostOf(website.href);
      if (host !== expectedHost && !host.endsWith(`.${expectedHost}`) && !expectedHost.endsWith(`.${host}`)) {
        if (final) {
          best = { identity: null, findings: [] };
          warning = "unverified-company";
        }
        return false;
      }
    }
    const supported = findings.filter(({ sourceId, text, excerpt }) => {
      const page = pages.get(sourceId);
      return !!page && normalize(page.text).includes(normalize(excerpt))
        && unverifiedFacts(text, factSources([identity.name, excerpt])).length === 0;
    });
    if (supported.length && (final || supported.length >= best.findings.length)) best = { identity, findings: supported };
    if (supported.length !== findings.length) warning ??= "invalid-response";
    else if (!supported.length && final && best.findings.length) warning ??= "no-findings";
    return supported.length > 0;
  }

  async function execute(name: string, raw: string): Promise<string> {
    const remaining = MAX_TOOL_CHARACTERS - contentLength;
    if (remaining < 1200) return "";
    const error = (code: string) => JSON.stringify({ error: code });
    try {
      if (typeof raw !== "string" || raw.length > 3000) return error("invalid-arguments");
      let args: unknown;
      try { args = JSON.parse(raw); } catch { return error("invalid-arguments"); }
      if (name === "searchWeb") {
        const parsed = params.searchWeb.safeParse(args);
        if (!parsed.success || /[@%]|https?:\/\/|\d{7,}/i.test(parsed.data.query) || cleanJobText(parsed.data.query) !== tidy(parsed.data.query)) return error("invalid-query");
        const query = normalize(parsed.data.query);
        if (queries.has(query)) return error("already-searched");
        queries.add(query);
        const results = await searchWeb(parsed.data.query, webOptions);
        const shown = [];
        for (const result of results) {
          if (JSON.stringify([...shown, result]).length > remaining - 500) break;
          shown.push(result);
        }
        return JSON.stringify(shown);
      }
      if (name !== "readPage") return error("unknown-tool");
      const parsed = params.readPage.safeParse(args);
      if (!parsed.success) return error("invalid-arguments");
      const url = publicWebUrl(parsed.data.url);
      if (!url) return error("invalid-url");
      if (visited.has(url.href)) return error("already-read");
      visited.add(url.href);
      const page = await readPage(url.href, webOptions);
      if (page.url !== url.href && visited.has(page.url)) return error("already-read");
      visited.add(page.url);
      const id = `S${pages.size + 1}`;
      const base = { id, url: page.url, title: page.title, retrievedAt: page.retrievedAt };
      const links: PageContent["links"] = [];
      let text = page.text.slice(0, remaining - 1000);
      while (JSON.stringify({ ...base, text, truncated: true, links }).length > remaining - 500 && text) {
        text = text.slice(0, Math.floor(text.length * 0.8));
      }
      if (!text || JSON.stringify({ ...base, text, truncated: true, links }).length > remaining - 500) return error("content-budget");
      const truncated = page.truncated || text !== page.text;
      for (const link of page.links) {
        if (JSON.stringify({ ...base, text, truncated, links: [...links, link] }).length > remaining - 500) break;
        links.push(link);
      }
      pages.set(id, { ...page, text, truncated, links });
      return JSON.stringify({ ...base, text, truncated, links });
    } catch (err) {
      signal.throwIfAborted();
      const code = err instanceof ResearchError ? err.code : "network";
      warning ??= code;
      if (code === "credentials" || code === "search-configuration") throw err;
      return error(code);
    }
  }

  try {
    if (!options.provider.toolTurn) throw new ResearchError("unsupported-provider");
    if (!options.apiKey) throw new ResearchError("missing-key");
    if (!context.company || !context.role) throw new ResearchError("unverified-company");
    await options.progress?.(RESEARCH_STEP);
    for (let turn = 0; turn <= MAX_TURNS; turn++) {
      signal.throwIfAborted();
      const final = turn === MAX_TURNS || contentLength >= MAX_TOOL_CHARACTERS - 1200
        || (requests.search === REQUEST_LIMITS.search && requests.extract === REQUEST_LIMITS.extract);
      if (final) messages.push({ role: "user", content: "The research phase is over. Return your best verified findings as JSON now." });
      const reply = await options.provider.toolTurn({ task: "research-company", system, messages, tools, allowTools: !final, signal });
      signal.throwIfAborted();
      if (reply.text) {
        const accepted = accept(reply.text, final || !reply.calls.length);
        if (final || (!reply.calls.length && accepted)) {
          finished = accepted;
          break;
        }
      }
      if (final) break;
      if (!reply.calls.length) {
        if (!pages.size || warning === "unverified-company") break;
        messages.push({ role: "assistant", content: reply.text }, { role: "user", content: "Return the requested JSON, using retrieved source IDs and exact supporting excerpts." });
        continue;
      }
      if (reply.calls.length > 16 || new Set(reply.calls.map((call) => call.id)).size !== reply.calls.length || reply.calls.some((call) => !call.id)) {
        throw new ResearchError("invalid-response");
      }
      messages.push({ role: "assistant", content: reply.text, calls: reply.calls, continuation: reply.continuation });
      for (const call of reply.calls) {
        signal.throwIfAborted();
        const content = await execute(call.name, call.arguments);
        contentLength += content.length;
        messages.push({ role: "tool", callId: call.id, content });
      }
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    warning = deadline.aborted ? "deadline" : error instanceof ResearchError ? error.code : "model-unavailable";
  }
  options.signal?.throwIfAborted();
  const findings = best.findings;
  const identity = findings.length ? best.identity : null;
  const usedIds = new Set([identity?.sourceId, ...findings.map(({ sourceId }) => sourceId)]);
  const sources = [...pages].flatMap(([id, { url, title, retrievedAt }]) => usedIds.has(id) ? [{ id, url, title, retrievedAt }] : []);
  const status = !findings.length ? "unavailable" : finished && !warning ? "complete" : "partial";
  warning ??= status === "complete" ? null : "no-findings";
  const finishedAt = new Date().toISOString();
  logServerWarning("Company research", JSON.stringify({ cacheReuse: false, durationMs: Date.parse(finishedAt) - Date.parse(startedAt), requests, warning }));
  return { version: 1, fingerprint: researchFingerprint(input), status, warning, identity, findings, sources, startedAt, finishedAt, requests };
}
