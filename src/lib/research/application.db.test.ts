import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";
import { json, stubFetch } from "@/lib/ai/test-http";
import { createApplicationFromDocuments } from "@/lib/application-create";
import { buildExport } from "@/lib/data-export";
import { importExport } from "@/lib/data-import";
import { refreshResearchJob } from "@/lib/jobs/refresh-research";
import { sweepFinishedJobs } from "@/lib/jobs/retention";
import { writeDocumentJob } from "@/lib/jobs/write-document";
import { writeDocumentsJob } from "@/lib/jobs/write-documents";
import { encryptSecret, ZYTE_KEY } from "@/lib/secrets";
import { saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { seedBuiltIns } from "../../../prisma/seed/built-ins";

import { savedCompanyResearch } from "./schema";

vi.mock("@/lib/env", () => ({ env: { ROLEPILOT_SECRET: "z".repeat(40), ROLEPILOT_DATA_DIR: "/tmp/rolepilot-research-fixture" } }));
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const ai = vi.hoisted(() => ({ provider: undefined as unknown }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => ai.provider }));
vi.mock("@/lib/memory/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memory/context")>()),
  prepareCandidateProfile: async (profile: unknown) => profile,
  assertCandidateContext: async () => {},
  assertMemoryRevision: async () => {},
  candidateMemoryRevision: () => undefined,
}));
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

const prisma = () => db.client!;
const details = { title: "Product Designer", company: "Ledgerly", role: "Product Designer", location: "", mode: "", salary: "", deadline: "" };
const extracted = { ...details, location: null, mode: null, salary: null, deadline: null, requirements: [], asksForReferences: false, language: null };
const posting = "Ledgerly is hiring a Product Designer.";
const url = "https://ledgerly.com/";
const finding = "Ledgerly supports teams in 22 countries.";
const privateNote = "Call Ada at private.candidate@example.com. Candidate worked on Quartz.";
const cvFixture = "Ledgerly resume fixture";
const read = { id: "read", name: "readPage", arguments: JSON.stringify({ url }) };

function mockResearch(text = finding) {
  const http = stubFetch(() => json({ url, browserHtml: `<title>Ledgerly</title><main>${text}</main>` }));
  const toolTurn = vi.fn()
    .mockResolvedValueOnce({ text: "", calls: [read] })
    .mockResolvedValueOnce({ text: JSON.stringify({ identity: { name: "Ledgerly", sourceId: "S1" }, findings: [{ text, excerpt: text, sourceId: "S1" }] }), calls: [] });
  const provider = Object.assign(new MockProvider({ reply: (call) =>
    call.json?.name === "tailored_resume"
      ? { summary: cvFixture, roles: [], projects: [], skills: [], education: [] }
      : { recipient: "Ledgerly", greeting: "Dear team,", paragraphs: [{ label: "Opening", text }], signOff: "Warm regards," },
  }), { toolTurn });
  ai.provider = provider;
  return { http, provider, toolTurn };
}

const job = () => ({ id: "test-job", step: vi.fn(async () => {}), signal: new AbortController().signal });
const match = { items: [] };
const input = { readJobId: "read-job", posting, postingUrl: url, extracted, match, tone: "WARM" as const, note: privateNote };
const reading = { posting, extracted, extractedWith: "extract-posting@3", matchedWith: "match-requirements@4" };

beforeEach(async () => {
  await resetDatabase(prisma());
  await seedBuiltIns(prisma());
  await saveSettings({ companyResearchEnabled: true, zyteVerified: true, zyteKeyEnc: encryptSecret(ZYTE_KEY, "db-test-zyte-key") });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => prisma().$disconnect());

it("carries sourced research from initial writing into the application and through retention, export, restore and deletion", async () => {
  const { provider, http, toolTurn } = mockResearch();
  const context = job();
  const documents = writeDocumentsJob.result.parse(await writeDocumentsJob.run({ ...input, write: "letter" }, context));
  expect(documents.companyResearch).toMatchObject({ status: "complete", findings: [{ text: finding }] });
  expect(context.step.mock.calls).toEqual([["Researching the company"], ["Writing your cover letter"]]);
  expect(provider.calls.at(-1)?.messages[0].content).toContain(finding);
  expect(JSON.stringify(toolTurn.mock.calls)).not.toContain(privateNote);
  expect(JSON.stringify(http.map((request) => request.body))).not.toContain("private.candidate");
  const id = await createApplicationFromDocuments({ reading, documents, match, details, postingUrl: url, tone: "WARM", note: privateNote, claim: { kind: "connector", postingId: null } });
  await prisma().job.create({ data: { type: "write-documents", status: "DONE", applicationId: id, input: {}, result: documents, finishedAt: new Date(0) } });
  expect(await sweepFinishedJobs(new Date(), 24)).toBe(1);
  expect(await prisma().application.findUnique({ where: { id } })).toMatchObject({ companyResearch: documents.companyResearch });
  const file = await buildExport(prisma(), { includeApiKey: true });
  expect(JSON.stringify(file)).not.toMatch(/db-test-zyte-key|zyteKeyEnc|zyteVerified/);
  expect(file.applications[0].companyResearch).toEqual(documents.companyResearch);
  expect(JSON.stringify(file.applications[0].documents)).not.toContain(url);
  await importExport(prisma(), file);
  expect(await prisma().application.findUnique({ where: { id } })).toMatchObject({ companyResearch: documents.companyResearch });
  await prisma().application.delete({ where: { id } });
  expect((await buildExport(prisma())).applications).toEqual([]);
});

it("writes a missing cover letter, reuses matching findings, and refreshes without touching the letter", async () => {
  const { provider, http, toolTurn } = mockResearch();
  const { id } = await prisma().application.create({ data: { ...details, deadline: null, postingText: posting, postingUrl: url, extracted } });
  await writeDocumentJob.run({ applicationId: id, kind: "COVER_LETTER" }, job());
  const first = await prisma().application.findUniqueOrThrow({ where: { id }, include: { documents: true } });
  expect(first.companyResearch).toMatchObject({ status: "complete", findings: [{ text: finding }] });
  expect(http).toHaveLength(1);
  await prisma().document.delete({ where: { id: first.documents[0].id } });
  await writeDocumentJob.run({ applicationId: id, kind: "COVER_LETTER" }, job());
  expect(toolTurn).toHaveBeenCalledTimes(2);
  expect(provider.calls.at(-1)?.messages[0].content).toContain(finding);
  const letter = await prisma().document.findFirstOrThrow({ where: { applicationId: id } });
  const refreshed = "Ledgerly offers a new reporting dashboard.";
  const fresh = mockResearch(refreshed);
  await refreshResearchJob.run({ applicationId: id }, job());
  expect(fresh.http).toHaveLength(1);
  expect(await prisma().document.findUnique({ where: { id: letter.id } })).toEqual(letter);
  expect(await prisma().application.findUnique({ where: { id } })).toMatchObject({ companyResearch: { status: "complete", findings: [{ text: refreshed }] } });
});

it("skips research for resume-only and disabled writing, and falls back for unsupported providers", async () => {
  const { provider, http, toolTurn } = mockResearch();
  const resume = await writeDocumentsJob.run({ ...input, write: "resume" }, job());
  expect(resume.companyResearch).toBeUndefined();
  await saveSettings({ companyResearchEnabled: false });
  const disabled = await writeDocumentsJob.run({ ...input, write: "letter" }, job());
  expect(disabled.companyResearch).toBeUndefined();
  expect(http).toHaveLength(0);
  expect(toolTurn).not.toHaveBeenCalled();

  ai.provider = new MockProvider({ reply: () => ({ recipient: "Ledgerly", greeting: "Dear team,", paragraphs: [{ label: "Opening", text: "I’m interested in this role." }], signOff: "Warm regards," }) });
  await saveSettings({ companyResearchEnabled: true });
  const unsupported = await writeDocumentsJob.run({ ...input, write: "letter" }, job());
  expect(unsupported.companyResearch).toMatchObject({ status: "unavailable", warning: "unsupported-provider" });
  expect(unsupported.letter.length).toBeGreaterThan(0);
  expect(provider.calls.some((call) => call.json?.name === "cover_letter")).toBe(true);
  expect(http).toHaveLength(0);
});

it.each(["expired", "changed", "failed"])("researches again when the saved result is %s", async (reason) => {
  const { id } = await prisma().application.create({ data: { ...details, deadline: null, postingText: posting, postingUrl: url, extracted } });
  mockResearch();
  await writeDocumentJob.run({ applicationId: id, kind: "COVER_LETTER" }, job());
  const previous = savedCompanyResearch((await prisma().application.findUniqueOrThrow({ where: { id } })).companyResearch)!;
  await prisma().document.deleteMany({ where: { applicationId: id } });
  if (reason === "changed") {
    await prisma().application.update({ where: { id }, data: { postingText: `${posting} Work with the platform team.` } });
  } else {
    const companyResearch = reason === "expired"
      ? { ...previous, finishedAt: "2020-01-01T00:00:00.000Z" }
      : { ...previous, status: "unavailable", identity: null, findings: [], sources: [], warning: "network" };
    await prisma().application.update({ where: { id }, data: { companyResearch } });
  }
  const refreshed = mockResearch("Ledgerly expanded its reporting for small teams.");
  await writeDocumentJob.run({ applicationId: id, kind: "COVER_LETTER" }, job());
  expect(refreshed.http).toHaveLength(1);
  expect((await prisma().application.findUniqueOrThrow({ where: { id } })).companyResearch).toMatchObject({
    status: "complete",
    findings: [{ text: "Ledgerly expanded its reporting for small teams." }],
  });
});
