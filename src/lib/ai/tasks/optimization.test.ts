import { describe, expect, it } from "vitest";
import { demoProfile } from "@/lib/demo-profile";
import { extractedSchema } from "@/lib/application-data";
import { withoutSectionsOff } from "@/lib/resume-sections";
import { demoDocumentState } from "@/test/document-state";
import { applyDocumentOperation, stateForPrompt } from "@/lib/document-state";
import { MockProvider } from "../providers/mock";
import { draftReply, matchRequirements, refineChat, regenerateUnit, tailorResume, writeCoverLetter, writeEmail, type TaskOptions } from "./index";

const profile = demoProfile();
const extracted = extractedSchema.parse({ title: "Analyst", company: "Acme", role: "Analyst", location: "", mode: "", salary: "", deadline: "2026-12-01", asksForReferences: false, requirements: [], language: "German" });
const base = { profile, extracted, posting: "Wir suchen Analysten", facts: [], match: null, tone: "WARM" as const };
const resumeAnswer = { summary: "Relevant experience.", roles: [], projects: [], education: [], skills: [] };
const letterAnswer = { recipient: "Acme", greeting: "Dear team,", paragraphs: [{ label: "Fit", text: "Relevant experience." }], signOff: "Warm regards," };
const emailAnswer = { contactName: null, contactEmail: null, subject: "Application", greeting: "Dear team,", paragraphs: ["Please find my application attached."], signOff: "Kind regards," };

for (const creativity of ["FAITHFUL", "BALANCED", "OPTIMIZED"] as const) {
  for (const strict of [true, false]) {
    it(`${creativity}, strict ${strict}: all writing paths use English once and the selected approach`, async () => {
      const options: TaskOptions = { creativity, strict };
      const provider = new MockProvider({ reply: call => {
        switch (call.json?.name) {
          case "tailored_resume": return resumeAnswer;
          case "cover_letter": return letterAnswer;
          case "application_email": return emailAnswer;
          case "new_text": return { text: "Relevant experience." };
          case "refinement": return { reply: "Updated.", edits: [], tone: null, declined: false };
          case "reply_draft": return { greeting: "Dear team,", paragraphs: ["Thank you."], signOff: "Best regards,", gaps: [] };
          default: throw new Error(`Unexpected task: ${call.json?.name}`);
        }
      } });
      await tailorResume(provider, base, options);
      await writeCoverLetter(provider, base, options);
      await writeEmail(provider, { ...base, letter: [] }, options);
      await regenerateUnit(provider, { ...base, kind: "RESUME", unit: { id: "summary", label: "Summary", text: "Old." }, document: [] }, options);
      await refineChat(provider, { ...base, request: "Improve summary", history: [], target: null, resume: [], letter: [] }, options);
      await draftReply(provider, { ...base, email: { from: "Acme", subject: "Bewerbung", body: "Vielen Dank", sentAt: new Date() }, timeZone: "UTC", thread: [], slots: [], note: "" }, options);
      expect(provider.calls).toHaveLength(6);
      for (const call of provider.calls) {
        expect(call.system.match(/Write in English/g)).toHaveLength(1);
        expect(call.system).not.toMatch(/same language as the job posting|in the email's language/);
        expect(call.temperature).toBe({ FAITHFUL: 0.2, BALANCED: 0.6, OPTIMIZED: 0.7 }[creativity]);
        if (creativity === "OPTIMIZED") {
          expect(call.system).not.toMatch(/Use only facts that are in|Stay truthful to the candidate/);
          expect(call.system).toContain("historical titles");
          expect(call.system).toContain("metrics");
        } else if (call.json?.name !== "refinement") {
          expect(call.system).toContain(strict ? "Use only facts that are in" : "Stay truthful to the candidate");
        }
      }
    });
  }
}

it("hidden evidence supports a general skill without printing its role or relocating its achievements", async () => {
  const full = { ...profile, experience: [{ ...profile.experience[0], bullets: "Coordinated engineers and sales to resolve customer issues." }] };
  const visible = withoutSectionsOff(full, { order: [], off: ["experience"] });
  const provider = new MockProvider({ reply: () => ({ ...resumeAnswer, roles: [{ id: full.experience[0].id, bullets: ["Hidden role"] }], skills: [{ name: "Cross-functional coordination", group: "Delivery", evidence: [{ sourceId: `experience:${full.experience[0].id}`, quote: "Coordinated engineers and sales" }] }] }) });
  const { data } = await tailorResume(provider, { ...base, profile: visible, evidenceProfile: full }, { creativity: "OPTIMIZED", strict: true });
  expect(data.some(unit => unit.id.startsWith("experience:"))).toBe(false);
  expect(data.find(unit => unit.id === "skills")?.text).toContain("Cross-functional coordination");
  expect(provider.calls[0].system).toContain("never print hidden entries");
});

describe("requirement provenance and adjacency", () => {
  const candidate = { ...profile, skills: [], experience: [{ ...profile.experience[0], bullets: "Built Power BI dashboards and coordinated engineers and sales." }] };
  const run = async (support: "direct" | "transferable" | "adjacent", id: string, quote: string) => {
    const provider = new MockProvider({ reply: () => ({ matches: [{ requirement: 0, skill: null, language: null, certification: null, support, evidence: [{ id, quote }] }] }) });
    const result = await matchRequirements(provider, { profile: candidate, requirements: [{ text: support === "adjacent" ? "Tableau dashboards" : "Cross-functional coordination", kind: "skill", skill: null, years: null, language: null }] }, { creativity: "OPTIMIZED", strict: true });
    expect(JSON.stringify(provider.calls[0].messages)).toContain("Built Power BI dashboards");
    expect(JSON.stringify(provider.calls[0].messages)).not.toContain(profile.basics.email);
    return result.data.items[0];
  };
  it("recognizes a capability in actions without a named skill", async () => {
    expect(await run("transferable", `experience:${candidate.experience[0].id}`, "coordinated engineers and sales")).toMatchObject({ result: "covered", evidenceOrigin: "profile", experienceIds: [candidate.experience[0].id] });
  });
  it("keeps adjacent tools partial", async () => {
    expect(await run("adjacent", `experience:${candidate.experience[0].id}`, "Built Power BI dashboards")).toMatchObject({ result: "partial", note: expect.stringContaining("adjacent") });
  });
  it.each([["experience:missing", "Built Power BI dashboards"], [`experience:${candidate.experience[0].id}`, "Invented quote"]])("rejects invalid provenance %s / %s", async (id, quote) => {
    expect(await run("direct", id, quote)).toMatchObject({ result: "gap" });
  });
});

it("preserves historical language metadata but cannot change it through document operations", () => {
  const state = { ...demoDocumentState(), language: "Arabic" };
  expect(stateForPrompt(state)).not.toHaveProperty("language");
  expect(() => applyDocumentOperation(state, [], { type: "settings", document: "RESUME", json: JSON.stringify({ language: "French" }) })).toThrow("Unknown document setting");
  expect(state.language).toBe("Arabic");
});

it("adjacency cannot become covered through a named skill mapping without citations", async () => {
  const candidate = { ...profile, skills: [{ id: "powerbi", name: "Power BI", group: "", sort: 0 }], experience: [{ ...profile.experience[0], skillIds: ["powerbi"] }] };
  const provider = new MockProvider({ reply: () => ({ matches: [{ requirement: 0, skill: "Power BI", language: null, certification: null, support: "adjacent", evidence: [] }] }) });
  const { data } = await matchRequirements(provider, { profile: candidate, requirements: [{ text: "Tableau dashboard development", kind: "skill", skill: "Tableau", years: null, language: null }] }, { creativity: "OPTIMIZED", strict: true });
  expect(data.items[0]).toMatchObject({ result: "partial", note: expect.stringContaining("Adjacent") });
});
