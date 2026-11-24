import { beforeEach, expect, it, vi } from "vitest";

import type { ToolTurn, ToolTurnRequest } from "@/lib/ai/provider";
import { callOneAction, OneActionError } from "@/lib/one/client";

import { findHiringContacts } from "./find-hiring-contacts";

vi.mock("@/lib/one/client", async (original) => ({
  ...await original<typeof import("@/lib/one/client")>(),
  callOneAction: vi.fn(),
}));

const posting = { company: "Ledgerly", role: "Designer", location: "Amsterdam", postingUrl: "", postingText: "This role reports to our Design Director." };
const options = { signal: new AbortController().signal, jobId: "job", muapiReady: true };
const excerpt = "Maya Rao is the hiring manager for the Designer opening at Ledgerly. Maya Rao is Design Director.";
const candidate = {
  name: "Maya Rao", title: "Design Director", relationship: "confirmed_hiring_manager",
  reason: "The opening names Maya as its hiring manager.", sourceIds: ["s1"], profileSourceId: null,
  evidenceQuote: "Maya Rao is Design Director.", managerQuote: "Maya Rao is the hiring manager for the Designer opening at Ledgerly.",
};
const result = (contacts: unknown[], status = "found") => ({ text: JSON.stringify({ status, contacts, employer: "Ledgerly" }), calls: [] });
const call = (name: string, args: object) => ({ text: "", calls: [{ id: "tool-1", name, arguments: JSON.stringify(args) }] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(callOneAction).mockResolvedValue([{ url: "https://example.com/designer", title: "Ledgerly Designer", excerpt }]);
});

it("lets the agent research a pasted opening and cite verified evidence", async () => {
  const turn = vi.fn<(request: ToolTurnRequest) => Promise<ToolTurn>>()
    .mockResolvedValueOnce(call("search_web", { query: "Ledgerly Designer hiring" }))
    .mockResolvedValueOnce(result([candidate]));
  await expect(findHiringContacts(turn, posting, options)).resolves.toMatchObject({
    status: "found", contacts: [{ name: "Maya Rao", relationship: "confirmed_hiring_manager", sources: [{ url: "https://example.com/designer" }] }],
  });
  expect(callOneAction).toHaveBeenCalledWith("searchWeb", { query: "Ledgerly Designer hiring" }, expect.objectContaining({ workflow: "peopleResearch" }));
  expect(turn.mock.calls[0][0].messages[0]).toMatchObject({ content: JSON.stringify(posting) });
});

it.each([
  { ...candidate, sourceIds: ["invented"] },
  { ...candidate, name: "Unknown Person" },
  { ...candidate, title: "Recruiting Coordinator" },
  { ...candidate, managerQuote: "The recruiter reports to Maya." },
])("drops unsupported candidates", async (person) => {
  const turn = vi.fn()
    .mockResolvedValueOnce(call("search_web", { query: "Ledgerly Designer hiring" }))
    .mockResolvedValueOnce(result([person]));
  await expect(findHiringContacts(turn, posting, options)).resolves.toMatchObject({ status: "no_reliable_contacts", contacts: [] });
});

it("distinguishes an ambiguous company from a provider failure", async () => {
  await expect(findHiringContacts(vi.fn().mockResolvedValue(result([], "needs_company")), { ...posting, company: "" }, options))
    .resolves.toMatchObject({ status: "needs_company" });

  vi.mocked(callOneAction).mockRejectedValue(new OneActionError("limits"));
  const turn = vi.fn().mockResolvedValueOnce(call("search_web", { query: "Ledgerly Designer" }))
    .mockResolvedValueOnce(result([], "no_reliable_contacts"));
  await expect(findHiringContacts(turn, posting, options)).rejects.toThrow("usage limit");
});

it("keeps useful web evidence when Muapi is unavailable", async () => {
  const turn = vi.fn().mockResolvedValueOnce(call("search_web", { query: "Ledgerly Designer hiring" }))
    .mockResolvedValueOnce(result([candidate]));
  await expect(findHiringContacts(turn, posting, { ...options, muapiReady: false }))
    .resolves.toMatchObject({ status: "found", partial: true });
  expect(turn.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name))
    .toEqual(["search_web", "read_public_page"]);
});

it("uses a company profile for employer context without assigning it a contact citation", async () => {
  vi.mocked(callOneAction).mockResolvedValueOnce([{ url: "https://www.linkedin.com/company/ledgerly", title: "Ledgerly", excerpt: "Ledgerly in Amsterdam" }]);
  const turn = vi.fn()
    .mockResolvedValueOnce(call("lookup_linkedin_company", { companyIdentifier: "ledgerly.com" }))
    .mockResolvedValueOnce(call("search_web", { query: "Ledgerly Designer hiring" }))
    .mockResolvedValueOnce(result([candidate]));
  await expect(findHiringContacts(turn, posting, options)).resolves.toMatchObject({ status: "found", contacts: [{ name: "Maya Rao" }] });
  expect(callOneAction).toHaveBeenNthCalledWith(1, "lookupLinkedInCompany", { companyIdentifier: "ledgerly.com" }, expect.anything());
  expect(turn.mock.calls[1][0].messages[2]).toMatchObject({
    content: JSON.stringify({ companyProfiles: [{ url: "https://www.linkedin.com/company/ledgerly", title: "Ledgerly", excerpt: "Ledgerly in Amsterdam" }] }),
  });
});

it("uses an available posting URL and can recover through public search when the page moved", async () => {
  const url = "https://example.com/jobs/old-designer";
  vi.mocked(callOneAction).mockRejectedValueOnce(new OneActionError("unavailable"));
  const turn = vi.fn()
    .mockResolvedValueOnce(call("read_public_page", { url }))
    .mockResolvedValueOnce(call("search_web", { query: "Ledgerly Designer hiring" }))
    .mockResolvedValueOnce(result([candidate]));
  await expect(findHiringContacts(turn, { ...posting, postingUrl: url }, options))
    .resolves.toMatchObject({ status: "found", partial: true });
  expect(callOneAction).toHaveBeenNthCalledWith(1, "readPublicPage", { url }, expect.anything());
  expect(callOneAction).toHaveBeenNthCalledWith(2, "searchWeb", { query: "Ledgerly Designer hiring" }, expect.anything());
});

it("caps web calls even when the model emits extra or duplicate queries", async () => {
  const turn = vi.fn()
    .mockResolvedValueOnce({
      text: "", calls: [1, 1, 2, 3, 4, 5].map((number, index) => ({
        id: `tool-${index}`, name: "search_web", arguments: JSON.stringify({ query: `Designer ${number}` }),
      })),
    })
    .mockResolvedValueOnce(result([], "no_reliable_contacts"));
  await expect(findHiringContacts(turn, posting, options)).resolves.toMatchObject({ status: "no_reliable_contacts" });
  expect(callOneAction).toHaveBeenCalledTimes(4);
});
