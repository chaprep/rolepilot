import "server-only";

import { callOneAction, isPublicWebUrl, OneActionError } from "@/lib/one/client";
import { FETCH_MESSAGES, fetchPosting } from "@/lib/posting-fetch";

const EXA_TIMEOUT_MS = 12_000;

function publicPostingLink(link: string): URL | null {
  if (!isPublicWebUrl(link)) return null;
  const url = new URL(link);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:token|access_token|auth|auth_token|api_key|apikey|key|password|secret|session(?:id)?|signature|sig|code|x-amz-.*|x-goog-.*)$/i.test(key)) return null;
    if (/^(?:utm_.*|fbclid|gclid|gh_src|lever-source|trk|trackingId)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url;
}

function samePosting(requested: URL, returned: URL) {
  const host = (url: URL) => url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  const path = (url: URL) => url.pathname.replace(/\/+$/, "");
  return host(requested) === host(returned) && path(requested) === path(returned) && requested.search === returned.search;
}

// shortcut: screen common walls and listing indexes, then let the user review the text.
function usablePosting(text: string, url: string) {
  if (text.trim().length < 200) return false;
  const { pathname, search } = new URL(url);
  if (/(?:^|\/)(?:login|log-in|signin|sign-in|authwall|captcha|checkpoint)(?:\/|$)/i.test(pathname)) return false;
  const opening = text.trimStart().slice(0, 800);
  if (/\b(?:this (?:job|posting|position|vacancy) (?:is no longer (?:available|open|accepting applications)|has (?:expired|been (?:closed|filled|removed)))|no longer accepting applications|verify (?:that )?you(?:'re| are) (?:a )?human|enable javascript and cookies to continue)\b/i.test(opening)) return false;
  const heading = opening.split("\n")[0].replace(/^[#>*\s]+/, "").trim();
  const hasJobDetails = /\b(?:responsibilities|qualifications|what you(?:'ll| will) do|about (?:the|this) role|requirements)\b/i.test(text);
  if (!hasJobDetails && /^(?:sign in|sign up|log in|access denied|forbidden|page not found|job not found|just a moment|request blocked|checking your browser)(?:\b|$)/i.test(heading)) return false;
  if (/^(?:current openings|open positions|job openings|jobs) at\b/i.test(heading) && !hasJobDetails) return false;
  const indexPath = !search && /^\/(?:careers|jobs|search|openings|opportunities)?\/?$/i.test(pathname);
  return !indexPath || !/\b(?:careers|all jobs|open (?:positions|roles)|job search|job openings|search jobs|current openings)\b/i.test(heading);
}

export async function importJobPosting(link: string) {
  const direct = await fetchPosting(link);
  if (direct.ok && usablePosting(direct.text, direct.url)) {
    return { ok: true, text: direct.text, url: direct.url, via: "direct" } as const;
  }
  const failure = { ok: false, error: direct.ok ? FETCH_MESSAGES.unreadable : direct.error } as const;
  if (!direct.ok && !direct.tryExa) return failure;
  const requested = publicPostingLink(link);
  if (!requested) return failure;

  const signal = AbortSignal.timeout(EXA_TIMEOUT_MS);
  try {
    const [page] = await callOneAction("readJobPosting", { url: requested.href }, { workflow: "jobImport", signal });
    if (!page) return failure;
    const returned = publicPostingLink(page.url);
    if (!returned || !samePosting(requested, returned) || !usablePosting(page.excerpt, page.url)) return failure;
    const excerpt = page.excerpt.trim();
    const text = page.title && !excerpt.toLowerCase().includes(page.title.toLowerCase())
      ? `${page.title}\n\n${excerpt}`
      : excerpt;
    return { ok: true, text, url: page.url, via: "exa" } as const;
  } catch (error) {
    if (!(error instanceof OneActionError)) throw error;
    return failure;
  }
}
