import { afterEach, describe, expect, it, vi } from "vitest";

import { hang, json, stubFetch } from "@/lib/ai/test-http";

import { publicWebUrl, readPage, searchWeb } from "./zyte";

const dns = vi.hoisted(() => vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]));
vi.mock("node:dns/promises", () => ({ lookup: dns }));
const options = { apiKey: "mock-zyte-key" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  dns.mockClear();
});

describe("Zyte Search and browser extraction", () => {
  it("uses Zyte Basic auth, ten organic results, and safe search URLs", async () => {
    const requests = stubFetch(() => json({ status: "success", organicResults: [
      { title: "Example", url: "https://example.com/about#team", snippet: "Public" },
      { title: "Local", url: "http://127.0.0.1/" },
    ] }));
    await expect(searchWeb("Example company", options)).resolves.toEqual([{ title: "Example", url: "https://example.com/about", snippet: "Public" }]);
    expect(requests[0]).toMatchObject({ method: "POST", body: { domain: "google.com", query: "Example company", include: ["organic"], maxResults: 10 } });
    expect(requests[0].url.href).toBe("https://api.zyte.com/v1/search");
    expect(requests[0].headers.get("authorization")).toBe(`Basic ${Buffer.from("mock-zyte-key:").toString("base64")}`);
  });

  it("extracts readable rendered content and links from the final URL", async () => {
    const requests = stubFetch(() => json({
      statusCode: 200, url: "https://example.com/company/about",
      browserHtml: "<title>Example</title><nav>Links</nav><main><script>window.secret = 1</script><p>Company builds products.</p><a href='./design'>Design</a><a href='http://localhost'>Hidden</a></main><footer>Boilerplate</footer>",
    }));
    const page = await readPage("https://example.com/", options);
    expect(page).toMatchObject({
      title: "Example", url: "https://example.com/company/about", truncated: false,
      links: [{ title: "Design", url: "https://example.com/company/design", snippet: "" }],
    });
    expect(page.text).toContain("Company builds products.");
    expect(page.text).not.toMatch(/secret|Boilerplate|Links/);
    expect(page.retrievedAt).toMatch(/^\d{4}-/);
    expect(requests[0].url.href).toBe("https://api.zyte.com/v1/extract");
    expect(requests[0].body).toEqual({ url: "https://example.com/", browserHtml: true });
  });

  it.each([401, 403, 422])("does not retry HTTP %s", async (status) => {
    const requests = stubFetch(() => json({}, { status }));
    await expect(searchWeb("Example", options)).rejects.toMatchObject({ code: status === 422 ? "search-configuration" : "credentials" });
    expect(requests).toHaveLength(1);
  });

  it.each([429, 503])("counts both attempts for transient HTTP %s", async (status) => {
    const onRequest = vi.fn();
    const requests = stubFetch(() => json({}, { status }));
    await expect(searchWeb("Example", { ...options, onRequest })).rejects.toMatchObject({ code: status === 429 ? "rate-limit" : "network" });
    expect(requests).toHaveLength(2);
    expect(onRequest.mock.calls).toEqual([["search"], ["search"]]);
  });

  it("rejects malformed JSON and unexpected response shapes", async () => {
    const response = vi.fn().mockImplementationOnce(() => new Response("{bad")).mockImplementationOnce(() => json({ status: "success", organicResults: "bad" }));
    const requests = stubFetch(response);
    await expect(searchWeb("Example", options)).rejects.toMatchObject({ code: "invalid-response" });
    await expect(searchWeb("Example", options)).rejects.toMatchObject({ code: "invalid-response" });
    expect(requests).toHaveLength(2);
  });

  it("caps page text and decoded response bytes", async () => {
    stubFetch(() => json({ url: "https://example.com/", browserHtml: `<main>${"x".repeat(16_000)}</main>` }));
    const page = await readPage("https://example.com/", options);
    expect(page.truncated).toBe(true);
    expect(page.text).toHaveLength(15_000);
    stubFetch(() => new Response("a".repeat(5 * 1024 * 1024 + 1)));
    await expect(searchWeb("Example", options)).rejects.toMatchObject({ code: "response-too-large" });
  });

  it("times out requests and bounds the retry", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const attempt = new AbortController();
      setTimeout(() => attempt.abort(new DOMException("Timed out", "TimeoutError")), 5);
      return attempt.signal;
    });
    const requests = stubFetch(hang);
    await expect(searchWeb("Example", options)).rejects.toMatchObject({ code: "request-timeout" });
    expect(timeout.mock.calls).toEqual([[30_000], [30_000]]);
    expect(requests).toHaveLength(2);
  });

  it("uses redirect:error so credentials cannot be forwarded", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 307, headers: { location: "https://unrelated.com/" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchWeb("Example", options)).rejects.toMatchObject({ code: "invalid-response" });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://api.zyte.com/v1/search", expect.objectContaining({ redirect: "error" }));
  });
});

describe("public web URLs", () => {
  it.each([
    "file:///tmp/foo", "https://user:password@example.com/", "http://localhost./", "http://intranet/",
    "http://192.168.1.1", "http://0x7f000001", "http://[::1]", "http://[::ffff:7f00:1]",
    "http://[fe80::1]", "http://metadata.google.internal/",
  ])("rejects %s", (url) => expect(publicWebUrl(url)).toBeNull());

  it("refuses a private DNS answer before making a request and refuses private final URLs", async () => {
    const requests = stubFetch(() => json({ url: "http://169.254.169.254/", browserHtml: "<main>Private</main>" }));
    dns.mockResolvedValueOnce([{ address: "10.1.2.3", family: 4 }, { address: "93.184.216.34", family: 4 }]);
    await expect(readPage("https://example.com", options)).rejects.toMatchObject({ code: "invalid-url" });
    expect(requests).toHaveLength(0);
    await expect(readPage("https://example.com", options)).rejects.toMatchObject({ code: "invalid-url" });
    expect(requests).toHaveLength(1);
  });
});
