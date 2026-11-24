import { zodResponseFormat } from "openai/helpers/zod";
import { beforeEach, expect, it, vi, type Mock } from "vitest";

import type { AIProvider } from "@/lib/ai/provider";
import { MockProvider } from "@/lib/ai/providers/mock";
import { coverLetterFingerprint, keepCandidateWarnings } from "@/lib/cover-letter-research";
import { demoProfile } from "@/lib/demo-profile";

import { generateCoverLetter } from "./generate-cover-letter";

const one = vi.hoisted(() => ({ setup: vi.fn(), action: vi.fn() }));
vi.mock("@/lib/one/config", () => ({ loadOneSetup: one.setup }));
vi.mock("@/lib/one/client", async (original) => ({
  ...(await original<typeof import("@/lib/one/client")>()), callOneAction: one.action,
}));

const company = "Ledgerly";
const posting = "Ledgerly is hiring a Designer in Amsterdam to build better onboarding for partner teams.";
const url = "https://ledgerly.example/jobs/designer";
const quote = "Ledgerly expanded its partner onboarding program.";
const draft = { recipient: "Ledgerly · Hiring team", greeting: "Dear Ledgerly team,", signOff: "Kind regards," };
const options = { creativity: "FAITHFUL", strict: true } as const;
const input = {
  posting, profile: demoProfile(), match: null, tone: "FORMAL" as const, facts: ["I expanded a partner program with PRIVATE-CANDIDATE-FIXTURE."],
  extracted: { title: "Designer", company, role: "Designer", location: "Amsterdam", mode: null, salary: null, deadline: null, requirements: [], asksForReferences: false, language: "English" },
};
const search = { id: "search", name: "search_web", arguments: '{"topic":"growth and partnerships"}' };
const read = { id: "read", name: "read_public_page", arguments: '{"sourceId":"posting"}' };
const finding = { sourceId: "source-1", fact: quote, quote, relevance: "The role owns onboarding.", inferred: true, candidateIds: ["a".repeat(24)] };

beforeEach(() => {
  vi.resetAllMocks();
  one.setup.mockResolvedValue({ reference: "ref", connectionKey: "connection" });
  one.action.mockResolvedValue([{ url: "https://ledgerly.example/news/partners", title: "Ledgerly News", excerpt: quote }]);
});

type ResearchTurn = NonNullable<AIProvider["toolTurn"]>;

function fixture(toolTurn: Mock<ResearchTurn>, badSource = false) {
  const prompts: string[] = [];
  const steps: string[] = [];
  const controller = new AbortController();
  const provider = Object.assign(new MockProvider({
    reply: call => {
      if (call.json) zodResponseFormat(call.json.schema, call.json.name);
      if (call.json?.name === "cover_letter_research_plan") return { question: "How is the company investing in partners?", topics: ["growth and partnerships"], candidateIds: [JSON.parse(call.messages[0].content).evidence.at(-1)[0]] };
      const context = call.messages[0].content;
      prompts.push(context);
      const sourced = context.includes(quote);
      const text = sourced ? quote : "I can help improve partner onboarding.";
      return { ...draft, paragraphs: [{ label: "Hook", text, companyClaims: sourced ? [{ sourceId: badSource ? "invented" : "source-1", claim: text }] : [] }] };
    },
  }), { toolTurn });
  return { provider, controller, prompts, steps, context: { id: "test", signal: controller.signal, step: async (name: string) => { steps.push(name); } } };
}

it.each([true, false])("researches with or without a public URL (URL: %s), filters evidence IDs, and sends public fields only to One", async withUrl => {
  const turn = vi.fn<ResearchTurn>()
    .mockResolvedValueOnce({ text: "", calls: [withUrl ? read : search] })
    .mockResolvedValueOnce({ text: JSON.stringify({ findings: [finding, { ...finding, quote: "Fabricated excerpt", fact: "Untrue" }] }), calls: [] });
  const { provider, context, prompts, steps } = fixture(turn);
  const postingUrl = withUrl ? url + "?token=private" : "";
  const result = await generateCoverLetter(provider, { ...input, postingUrl }, options, context);

  expect(steps).toEqual(["Researching the company", "Writing your cover letter"]);
  expect(one.action).toHaveBeenCalledWith(
    withUrl ? "readPublicPage" : "searchWeb",
    withUrl ? { url } : { query: "Ledgerly growth partner program partnerships" },
    expect.objectContaining({ workflow: "companyResearch" }),
  );
  expect(result.research).toMatchObject({
    outcome: "sourced", findings: [{ ...finding, candidateIds: [] }],
    fingerprint: coverLetterFingerprint({ company, role: "Designer", location: "Amsterdam", postingUrl, postingText: posting }),
  });
  expect(turn.mock.calls[0][0].messages[0].content).toContain("PRIVATE-CANDIDATE-FIXTURE");
  expect(JSON.stringify(one.action.mock.calls)).not.toContain("PRIVATE-CANDIDATE-FIXTURE");
  expect(prompts).toHaveLength(1);
  expect(result.data.find(unit => unit.id === "paragraph:1")?.text).toBe(quote);
});

it("writes a posting-only draft after an invalid citation or unavailable search", async () => {
  const turn = vi.fn<ResearchTurn>().mockResolvedValueOnce({ text: "", calls: [search] }).mockResolvedValueOnce({ text: JSON.stringify({ findings: [finding] }), calls: [] });
  const first = fixture(turn, true);
  const result = await generateCoverLetter(first.provider, input, options, first.context);
  expect(first.prompts).toHaveLength(2);
  expect(first.prompts[1]).not.toContain(quote);
  expect(result.data.find(unit => unit.id === "paragraph:1")?.text).toBe("I can help improve partner onboarding.");

  one.action.mockRejectedValueOnce(new Error("Offline"));
  turn.mockResolvedValueOnce({ text: "", calls: [search] }).mockResolvedValueOnce({ text: JSON.stringify({ findings: [] }), calls: [] });
  const second = fixture(turn);
  const fallback = await generateCoverLetter(second.provider, input, options, second.context);
  expect(fallback.research).toMatchObject({ outcome: "unavailable", findings: [] });
  expect(second.prompts).toHaveLength(1);
  expect(second.prompts[0]).not.toContain(quote);
});

it("skips planning and Luna when disconnected, and propagates cancellation", async () => {
  const turn = vi.fn<ResearchTurn>();
  const { controller, provider, context, steps } = fixture(turn);
  one.setup.mockResolvedValueOnce(null);
  await generateCoverLetter(provider, input, options, context);
  expect(turn).not.toHaveBeenCalled();
  expect(steps).toEqual(["Writing your cover letter"]);
  controller.abort();
  await expect(generateCoverLetter(provider, input, options, context)).rejects.toMatchObject({ name: "AbortError" });
});

it("counts invalid tool calls toward the limit and refuses arbitrary query text or URLs", async () => {
  const turn = vi.fn<ResearchTurn>()
    .mockResolvedValueOnce({ text: "", calls: [
      { ...search, id: "arbitrary", arguments: '{"query":"PRIVATE"}' },
      { ...read, id: "arbitrary-url", arguments: '{"sourceId":"https://example.net/?private"}' },
      search, { ...search, id: "repeat" }, { ...read, id: "missing" }, { ...read, id: "budget" },
    ] })
    .mockResolvedValueOnce({ text: '{"findings":[]}', calls: [] });
  const { provider, context } = fixture(turn);
  await generateCoverLetter(provider, input, options, context);
  expect(one.action).toHaveBeenCalledTimes(1);
  expect(turn.mock.calls[1][0].allowTools).toBe(false);
});

it("clears a source-backed company warning without clearing the same warning in a separate candidate claim", async () => {
  const turn = vi.fn<ResearchTurn>()
    .mockResolvedValueOnce({ text: "", calls: [search] })
    .mockResolvedValueOnce({ text: JSON.stringify({ findings: [finding] }), calls: [] });
  const { provider, context } = fixture(turn);
  const { research } = await generateCoverLetter(provider, input, options, context);
  const claims = [{ sourceId: "source-1", claim: quote }];
  expect(keepCandidateWarnings(quote, ["Ledgerly"], claims, research)).toBeUndefined();
  expect(keepCandidateWarnings(quote + " I worked for Ledgerly.", ["Ledgerly"], claims, research)).toEqual(["Ledgerly"]);
  expect(keepCandidateWarnings("Ledgerly expanded its program by 99%.", ["99%"],
    [{ sourceId: "source-1", claim: "Ledgerly expanded its program by 99%." }], research)).toEqual(["99%"]);
});
