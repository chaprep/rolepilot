import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { demoProfile } from "@/lib/demo-profile";
import { MockProvider } from "@/lib/ai/providers/mock";
import { applyMemoryExtraction, forgetMemory, memoryState, recordMemorySource, withdrawSources } from "./store";
import { prepareCandidateProfile, currentApplicationFactTexts, assertCandidateContext } from "./context";
import { backfillMemory, processMemorySource } from "./process";
import { extractionSchema, supportedClaim, type MemoryClaim } from "./schema";
import { matchRequirements } from "@/lib/ai/tasks/match-requirements";
import { buildExport } from "@/lib/data-export";
import { importExport, parseExport } from "@/lib/data-import";
import { validateMemoryImport } from "./import";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => { const { createTestClient } = await import("@/test/db"); db.client = createTestClient(); return { prisma: db.client }; });
vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "s".repeat(32) } }));
const prisma = () => db.client!;
const claim = (text = "I used Docker to deploy internal tools.", extra: Partial<MemoryClaim> = {}): MemoryClaim => ({ text, quote: text, kind: "EXPERIENCE", subject: "deployments", capabilities: ["Docker"], unitId: null, replaces: null, conflicts: [], ...extra });
async function remember(text = claim().text, key = "message:one", extra: Partial<MemoryClaim> = {}) {
  const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: key, kind: "CHAT", text, applicationId: "a", context: { scope: "UNRESOLVED" } }));
  await applyMemoryExtraction(source, [claim(text, extra)], []);
  return { source, fact: await prisma().memoryFact.findFirstOrThrow({ where: { evidence: { some: { sourceId: source.id } } } }) };
}
beforeEach(async () => { await resetDatabase(prisma()); await prisma().application.createMany({ data: [{ id: "a", company: "Company A" }, { id: "b", company: "Company B" }] }); });
afterAll(() => prisma().$disconnect());

describe("automatic reusable memory", () => {
  it("reuses experience across applications without changing the profile or documents", async () => {
    const before = demoProfile();
    await remember();
    const input = await prepareCandidateProfile(before, "containerization");
    expect(input.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^memory:/), text: expect.stringContaining("Docker") })]));
    expect(before).toEqual(demoProfile());
    expect(await prisma().skill.count()).toBe(0);
    expect(await prisma().document.count()).toBe(0);
  });
  it("retains sources and facts when an application is deleted", async () => {
    const { source } = await remember();
    await prisma().application.delete({ where: { id: "a" } });
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ applicationId: null, text: claim().text });
    expect((await prepareCandidateProfile(demoProfile())).facts.some(row => row.text.includes("Docker"))).toBe(true);
  });
  it("deduplicates sources and supports multiple independent sources for one fact", async () => {
    const first = await remember();
    const same = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "message:one", kind: "CHAT", text: claim().text, applicationId: "a", context: { scope: "UNRESOLVED" } }));
    expect(same.id).toBe(first.source.id);
    await remember(claim().text, "message:two");
    expect(await prisma().memoryFact.count()).toBe(1);
    expect(await prisma().memoryEvidence.count()).toBe(2);
    await prisma().$transaction(tx => withdrawSources(tx, [first.source.id]));
    expect((await prepareCandidateProfile(demoProfile())).facts.some(row => row.id === `memory:${first.fact.id}`)).toBe(true);
  });
  it("makes mutable revisions inactive before extracting their replacement", async () => {
    const { source, fact } = await remember();
    const revision = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: source.sourceKey, kind: "CHAT", text: "I used Podman.", context: { scope: "UNRESOLVED" } }));
    expect(revision.revision).toBe(2);
    expect(await prisma().memoryFact.findUnique({ where: { id: fact.id } })).toMatchObject({ status: "WITHDRAWN" });
    await applyMemoryExtraction(source, [claim()], []);
    expect(await prisma().memoryFact.findUnique({ where: { id: fact.id } })).toMatchObject({ status: "WITHDRAWN" });
  });
  it("supersedes an explicitly corrected fact without reusing the old statement", async () => {
    const first = await remember("I mentored three developers.");
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "correction:one", kind: "CORRECTION", text: "I mentored four developers.", context: { correctionId: first.fact.id } }));
    await applyMemoryExtraction(source, [claim(source.text, { subject: "deployments", replaces: first.fact.id })], []);
    expect(await prisma().memoryFact.findUnique({ where: { id: first.fact.id } })).toMatchObject({ status: "SUPERSEDED" });
    const context = await prepareCandidateProfile(demoProfile());
    expect(context.facts.some(row => row.text.includes("three"))).toBe(false);
    expect(context.facts.some(row => row.text.includes("four"))).toBe(true);
  });
  it("forgets excerpts, suppresses historical replay and strips frozen embedded facts", async () => {
    const { fact, source } = await remember();
    await forgetMemory(fact.id, fact.revision);
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ text: "", status: "SUPPRESSED", extraction: null });
    const old = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "old:one", kind: "HISTORICAL", text: claim().text, applicationId: "a", context: { scope: "UNRESOLVED" }, submittedAt: new Date(0) }));
    await applyMemoryExtraction(old, [claim()], []);
    const context = await prepareCandidateProfile({ ...demoProfile(), facts: [{ id: "old-frozen", text: claim().text }] });
    expect(context.facts.some(row => row.text.includes("Docker"))).toBe(false);
    expect(await prisma().memoryEvidence.count({ where: { memoryFactId: fact.id } })).toBe(0);
  });
  it("does not backfill a forgotten application's raw fact mirror", async () => {
    const raw = await prisma().fact.create({ data: { applicationId: "a", text: claim().text } });
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "draft:one:note", kind: "INITIAL_NOTE", text: raw.text, factId: raw.id, applicationId: "a" }));
    await applyMemoryExtraction(source, [claim()], []);
    const fact = await prisma().memoryFact.findFirstOrThrow();
    await forgetMemory(fact.id, fact.revision);
    expect(await backfillMemory()).toBe(0);
    expect(await currentApplicationFactTexts("a", [raw])).toEqual([]);
  });
  it("keeps general evidence unattributed even when a model supplies a role", async () => {
    await prisma().experience.create({ data: { id: "role", company: "Company X" } });
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "evidence:one", kind: "EVIDENCE", text: claim().text, context: { scope: "GENERAL" } }));
    await applyMemoryExtraction(source, [claim(claim().text, { unitId: "experience:role" })], [{ id: "experience:role", label: "Developer at Company X" }]);
    expect(await prisma().memoryFact.findFirst()).toMatchObject({ experienceId: null, attribution: { scope: "GENERAL", unitId: null } });
  });
  it("does not create a global relation for an application-local entry", async () => {
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "local:one", kind: "CHAT", text: claim().text, context: { scope: "UNRESOLVED" } }));
    await applyMemoryExtraction(source, [claim(claim().text, { unitId: "experience:local" })], [{ id: "experience:local", label: "Developer at Company X" }]);
    expect(await prisma().memoryFact.findFirst()).toMatchObject({ experienceId: null, attribution: { scope: "LOCAL" } });
  });
  it("matches a remembered capability absent from global skills using cited evidence", async () => {
    await remember();
    const profile = await prepareCandidateProfile({ ...demoProfile(), skills: [] });
    const memory = profile.facts.find(row => row.id.startsWith("memory:"))!;
    const provider = new MockProvider({ reply: () => ({ matches: [{ requirement: 0, skill: null, language: null, certification: null, evidence: [{ id: memory.id, quote: claim().text }] }] }) });
    const result = await matchRequirements(provider, { requirements: [{ text: "Containerization experience", kind: "skill", skill: "Docker", years: null, language: null }], profile }, { creativity: "FAITHFUL", strict: true });
    expect(result.data.items[0]).toMatchObject({ result: "partial", evidenceOrigin: "memory", evidenceIds: [memory.id] });
  });
  it("persists failed extraction and retries without discarding the source", async () => {
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "failure", kind: "CHAT", text: claim().text }));
    await expect(processMemorySource(source.id, new MockProvider({ reply: () => { throw new Error("offline"); } }))).rejects.toThrow();
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ status: "FAILED", text: claim().text });
    await processMemorySource(source.id, new MockProvider({ reply: () => ({ claims: [claim()] }) }));
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ status: "DONE", attempts: 2 });
  });
  it("waits for an already running capture instead of failing a concurrent new request", async () => {
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "concurrent", kind: "CHAT", text: claim().text }));
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const model = new MockProvider({ reply: async () => { started(); await gate; return { claims: [claim()] }; } });
    const processing = processMemorySource(source.id, model);
    await entered;
    const preparing = prepareCandidateProfile(demoProfile());
    await new Promise(resolve => setTimeout(resolve, 30));
    release();
    const [input] = await Promise.all([preparing, processing]);
    expect(input.facts.some(fact => fact.text.includes("Docker"))).toBe(true);
    expect(model.calls).toHaveLength(1);
  });
  it("marks instruction-only submissions processed with no facts", async () => {
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "style", kind: "CHAT", text: "Make the heading blue." }));
    await processMemorySource(source.id, new MockProvider({ reply: () => ({ claims: [] }) }));
    expect(await prisma().memoryFact.count()).toBe(0);
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ status: "DONE" });
  });
  it("withholds ambiguous facts and preserves a focused clarification question", async () => {
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "ambiguous", kind: "CHAT", text: "Actually, four developers." }));
    await processMemorySource(source.id, new MockProvider({ reply: () => ({ claims: [], clarifications: ["Which role did you mentor four developers in?"] }) }));
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ status: "NEEDS_CONTEXT", error: "Which role did you mentor four developers in?" });
    expect(await prisma().memoryFact.count()).toBe(0);
  });
  it("rejects unquoted claims, private fields and unchanged old text", () => {
    expect(supportedClaim(claim(), "Use Docker in the job description")).toBe(false);
    expect(supportedClaim(claim("My email is a@b.com"), "My email is a@b.com")).toBe(false);
    expect(supportedClaim(claim(), claim().text, claim().text)).toBe(false);
    expect(extractionSchema.parse({ claims: [] })).toEqual({ claims: [] });
  });
  it("does not reactivate a forgotten source on an identical submission retry", async () => {
    const { fact, source } = await remember();
    await forgetMemory(fact.id, fact.revision);
    const retried = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: source.sourceKey, kind: "CHAT", text: claim().text, context: { scope: "UNRESOLVED" } }));
    expect(retried.id).toBe(source.id);
    expect(retried.status).toBe("SUPPRESSED");
    expect(await prisma().memorySource.count()).toBe(1);
  });
  it("rejects results whose candidate context was forgotten while a request was running", async () => {
    const { fact } = await remember();
    const input = await prepareCandidateProfile(demoProfile());
    await forgetMemory(fact.id, fact.revision);
    await expect(prisma().$transaction(tx => assertCandidateContext(input, tx))).rejects.toThrow(/changed/);
  });
  it("suppresses a stale correction instead of poisoning the pending queue", async () => {
    const first = await remember("I mentored three developers.");
    const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "stale-correction", kind: "CORRECTION", text: "I mentored four developers.", context: { correctionId: first.fact.id, correctionRevision: first.fact.revision } }));
    await prisma().memoryFact.update({ where: { id: first.fact.id }, data: { revision: { increment: 1 } } });
    await applyMemoryExtraction(source, [claim(source.text, { replaces: first.fact.id })], []);
    expect(await prisma().memorySource.findUnique({ where: { id: source.id } })).toMatchObject({ status: "SUPPRESSED" });
    expect(await prisma().memoryFact.count()).toBe(1);
    await expect(prepareCandidateProfile(demoProfile())).resolves.toBeDefined();
  });
  it("withholds conflicting assertions and their application mirrors", async () => {
    const first = await remember("I mentored three developers.");
    await remember("I mentored four developers.", "message:two", { conflicts: [first.fact.id] });
    expect(await prisma().memoryFact.count({ where: { status: "CONFLICTED" } })).toBe(2);
    expect((await prepareCandidateProfile(demoProfile())).facts.some(row => /mentored/.test(row.text))).toBe(false);
  });
  it("does not promote agent-generated notes during historical backfill", async () => {
    await prisma().application.update({ where: { id: "a" }, data: { origin: "AGENT" } });
    await prisma().fact.create({ data: { applicationId: "a", text: claim().text } });
    expect(await backfillMemory()).toBe(0);
  });
  it("round-trips sources, corrected/forgotten facts and suppression through exports", async () => {
    const first = await remember();
    await forgetMemory(first.fact.id, first.fact.revision);
    await remember("I built Python reporting tools.", "message:two");
    const file = await buildExport(prisma());
    const parsed = parseExport(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    validateMemoryImport(parsed.data);
    await importExport(prisma(), parsed.data);
    const input = await prepareCandidateProfile(demoProfile());
    expect(input.facts.some(row => row.text.includes("Python"))).toBe(true);
    expect(input.facts.some(row => row.text.includes("Docker"))).toBe(false);
    expect((await memoryState()).revision).toBe(file.memory!.state!.revision);
  });
});
