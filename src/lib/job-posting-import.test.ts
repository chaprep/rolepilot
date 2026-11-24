import { beforeEach, describe, expect, it, vi } from "vitest";

import { callOneAction, OneActionError } from "@/lib/one/client";
import { FETCH_MESSAGES, fetchPosting } from "@/lib/posting-fetch";

import { importJobPosting } from "./job-posting-import";

vi.mock("@/lib/one/client", async (original) => ({
  ...await original<typeof import("@/lib/one/client")>(), callOneAction: vi.fn(),
}));
vi.mock("@/lib/posting-fetch", async (original) => ({
  ...await original<typeof import("@/lib/posting-fetch")>(), fetchPosting: vi.fn(),
}));

const link = "https://hiring.example.com/jobs/52?gh_jid=52";
const text = "Responsibilities\n" + "Design the product alongside engineering and research. ".repeat(5_000).slice(0, 30_000);
const unavailable = { ok: false, error: FETCH_MESSAGES.unreachable, tryExa: true } as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchPosting).mockResolvedValue(unavailable);
});

describe("importJobPosting", () => {
  it("returns a usable direct posting without calling One", async () => {
    vi.mocked(fetchPosting).mockResolvedValue({ ok: true, source: "page", text, url: link });
    expect(await importJobPosting(link)).toEqual({ ok: true, text, url: link, via: "direct" });
    expect(callOneAction).not.toHaveBeenCalled();
  });

  it("recovers a blocked direct fetch or a sign-in wall with one Exa call for the same posting", async () => {
    const returned = "https://www.hiring.example.com/jobs/52/?utm_source=board&gh_jid=52";
    vi.mocked(callOneAction).mockResolvedValue([{ url: returned, title: "Product Designer", excerpt: text }]);
    const input = link + "&utm_medium=social#description";
    for (const direct of [unavailable, { ok: true, source: "page", text: "Sign in\n" + "Create an account. ".repeat(25), url: link }] as const) {
      vi.mocked(fetchPosting).mockResolvedValueOnce(direct);
      expect(await importJobPosting(input)).toEqual({ ok: true, text: "Product Designer\n\n" + text, url: returned, via: "exa" });
    }
    expect(callOneAction).toHaveBeenCalledTimes(2);
    expect(callOneAction).toHaveBeenCalledWith("readJobPosting", { url: link }, { workflow: "jobImport", signal: expect.any(AbortSignal) });
  });

  it("does not send unsafe URLs or follow a private redirect through Exa", async () => {
    await importJobPosting("http://127.0.0.1/job");
    await importJobPosting(link + "&access_token=secret");
    vi.mocked(fetchPosting).mockResolvedValueOnce({ ok: false, error: FETCH_MESSAGES.privateAddress });
    await importJobPosting(link);
    vi.mocked(fetchPosting).mockResolvedValueOnce({ ok: false, error: FETCH_MESSAGES.failed(410) });
    await importJobPosting(link);
    expect(callOneAction).not.toHaveBeenCalled();
  });

  it("rejects mismatched jobs, expired listings, and general careers pages", async () => {
    vi.mocked(callOneAction)
      .mockResolvedValueOnce([{ url: link.replace("gh_jid=52", "gh_jid=53"), title: "Different job", excerpt: text }])
      .mockResolvedValueOnce([{ url: link, title: "Former opening", excerpt: "This job is no longer available. " + text }])
      .mockResolvedValueOnce([{ url: "https://hiring.example.com/careers", title: "Careers", excerpt: "Careers\n" + "See all jobs. ".repeat(25) }]);
    for (const url of [link, link, "https://hiring.example.com/careers"]) expect(await importJobPosting(url)).toMatchObject({ ok: false });
  });

  it.each(["notConfigured", "notConnected", "cancelled", "timeout"] as const)("keeps the manual paste message when One returns %s", async (code) => {
    vi.mocked(callOneAction).mockRejectedValue(new OneActionError(code));
    expect(await importJobPosting(link)).toEqual({ ok: false, error: FETCH_MESSAGES.unreachable });
  });
});
