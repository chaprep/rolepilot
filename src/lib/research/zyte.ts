import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { parse } from "node-html-parser";
import { z } from "zod";

import { boundedResponse, ResponseTooLarge } from "@/lib/bounded-response";
import { isPublicAddress } from "@/lib/posting-fetch";

import type { ResearchWarning } from "./schema";

export const SEARCH_DOMAIN = "google.com";
export const REQUEST_LIMITS = { search: 3, extract: 5 } as const;
type Endpoint = keyof typeof REQUEST_LIMITS;

export type SearchResult = { title: string; url: string; snippet: string };
export type PageContent = { title: string; url: string; text: string; retrievedAt: string; truncated: boolean; links: SearchResult[] };
type Options = { apiKey: string; signal?: AbortSignal; onRequest?: (endpoint: Endpoint) => void };

export class ResearchError extends Error {
  constructor(readonly code: ResearchWarning, readonly retryable = false) {
    super(code);
  }
}

export function publicWebUrl(value: string): URL | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    const version = isIP(host);
    if (version) {
      // WHATWG normalizes mapped IPv4 addresses to hexadecimal.
      if (host.toLowerCase().startsWith("::ffff:") || !isPublicAddress(host)) return null;
    } else if (!host.includes(".") || /(?:^|\.)(?:localhost|local|internal|home\.arpa|test|invalid|example|onion)$/i.test(host)) {
      return null;
    }
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function requirePublicUrl(value: string, signal: AbortSignal): Promise<URL> {
  const url = publicWebUrl(value);
  if (!url) throw new ResearchError("invalid-url");
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) return url;
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new ResearchError("invalid-url");
  return url;
}

function responseError(endpoint: Endpoint, status: number): ResearchError {
  if (status === 401 || status === 403) return new ResearchError("credentials");
  if (status === 429) return new ResearchError("rate-limit", true);
  if (endpoint === "extract" && status === 521) return new ResearchError("page-unavailable");
  if (status >= 500) return new ResearchError("network", true);
  if (status === 408) return new ResearchError("request-timeout", true);
  if (endpoint === "search" && status >= 400 && status < 500) return new ResearchError("search-configuration");
  return new ResearchError(endpoint === "extract" ? "page-unavailable" : "invalid-response");
}

async function zyte<T>(endpoint: Endpoint, options: Options, run: (signal: AbortSignal, request: <R>(body: object, schema: z.ZodType<R>) => Promise<R>) => Promise<T>): Promise<T> {
  let lastError: ResearchError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(30_000);
    const signal = AbortSignal.any([timeout, ...(options.signal ? [options.signal] : [])]);
    try {
      return await new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        void run(signal, async (body, schema) => {
          signal.throwIfAborted();
          options.onRequest?.(endpoint);
          const response = await fetch(`https://api.zyte.com/v1/${endpoint}`, {
            method: "POST",
            redirect: "error",
            headers: { Authorization: `Basic ${Buffer.from(`${options.apiKey}:`).toString("base64")}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal,
          });
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            throw responseError(endpoint, response.status);
          }
          const data = schema.safeParse(await boundedResponse(response).json());
          if (!data.success) throw new ResearchError("invalid-response");
          return data.data;
        }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof ResearchError && error.code === "budget" && lastError) throw lastError;
      lastError = error instanceof ResearchError ? error
        : error instanceof ResponseTooLarge ? new ResearchError("response-too-large")
        : timeout.aborted ? new ResearchError("request-timeout", true)
        : error instanceof SyntaxError ? new ResearchError("invalid-response")
        : new ResearchError("network", true);
      if (!lastError.retryable || attempt === 1) throw lastError;
    }
  }
  throw lastError;
}

const searchResponse = z.object({
  status: z.literal("success"),
  organicResults: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string().nullish() })),
});

export async function searchWeb(query: string, options: Options): Promise<SearchResult[]> {
  return zyte("search", options, async (_signal, request) => {
    const data = await request({ domain: SEARCH_DOMAIN, query, include: ["organic"], maxResults: 10 }, searchResponse);
    return data.organicResults.slice(0, 10).flatMap(({ title, url, snippet }) => {
      const safe = publicWebUrl(url);
      return safe ? [{ title: title.slice(0, 240), url: safe.href, snippet: snippet?.slice(0, 600) ?? "" }] : [];
    });
  });
}

const pageResponse = z.object({ url: z.string(), browserHtml: z.string(), statusCode: z.number().int().optional() });
const MAX_PAGE_CHARACTERS = 15_000;

export async function readPage(url: string, options: Options): Promise<PageContent> {
  return zyte("extract", options, async (signal, request) => {
    const requested = await requirePublicUrl(url, signal);
    const data = await request({ url: requested.href, browserHtml: true }, pageResponse);
    if (data.statusCode && (data.statusCode < 200 || data.statusCode >= 300)) throw new ResearchError("page-unavailable");
    const final = data.url === requested.href ? requested : await requirePublicUrl(data.url, signal);
    const root = parse(data.browserHtml);
    const title = (root.querySelector("title")?.text || root.querySelector("h1")?.text || final.hostname).trim().slice(0, 240);
    const navigation = root.querySelectorAll("header a[href], nav a[href], footer a[href]");
    for (const element of root.querySelectorAll("head, header, script, style, nav, footer, aside, form, noscript, template, iframe, svg, button, [hidden], [aria-hidden=true]")) element.remove();
    const main = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector('[role="main"]') ?? root.querySelector("body") ?? root;
    const text = main.structuredText.replace(/[^\S\n]+/g, " ").trim();
    if (!text) throw new ResearchError("page-unavailable");
    const links = new Map<string, SearchResult>();
    for (const anchor of [...main.querySelectorAll("a[href]"), ...navigation]) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) continue;
      try {
        const link = publicWebUrl(new URL(href, final).href);
        if (link && link.href !== final.href) links.set(link.href, { url: link.href, title: anchor.text.trim().slice(0, 120), snippet: "" });
      } catch { /* Invalid link. */ }
      if (links.size >= 15) break;
    }
    return { title, url: final.href, text: text.slice(0, MAX_PAGE_CHARACTERS), retrievedAt: new Date().toISOString(), truncated: text.length > MAX_PAGE_CHARACTERS, links: [...links.values()] };
  });
}
