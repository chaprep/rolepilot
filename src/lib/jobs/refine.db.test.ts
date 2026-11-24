import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { demoDocumentState } from "@/test/document-state";
import { readDocumentState, documentChangesSchema } from "@/lib/document-state";
import { MockProvider } from "@/lib/ai/providers/mock";
import { demoLetterUnits, demoResumeUnits } from "@/lib/demo-profile";
import { createTestClient, resetDatabase } from "@/test/db";

import { refineJob } from "./refine";
import { recordMemorySource } from "@/lib/memory/store";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const provider = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => provider.current }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "BALANCED", strict: true }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile(), loadFactTexts: async () => [] };
});
vi.mock("./runner", () => ({ defineJob: <T,>(definition: T) => definition }));

const prisma = () => db.client!;
const resume = demoResumeUnits();
const letter = [...demoLetterUnits(), { id: "sign-off", label: "Sign-off", text: "Warm regards," }];
const context = { id: "test-job", step: async () => {}, signal: new AbortController().signal };
const reply = (answer: object) => new MockProvider({ reply: () => ({ edits: [], tone: null, declined: false, ...answer }) });

async function ask(request: string, extra: { target?: { document: "RESUME" | "COVER_LETTER"; unitId: string } | null } = {}) {
  const message = await prisma().chatMessage.create({ data: { applicationId: "app-1", role: "USER", text: request } });
  return refineJob.run({ applicationId: "app-1", messageId: message.id, request, target: extra.target ?? null, viewing: "RESUME" }, context);
}
const units = async (kind: "RESUME" | "COVER_LETTER") =>
  (await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind } } })).units as typeof resume;
const lastMessage = () => prisma().chatMessage.findFirstOrThrow({ where: { applicationId: "app-1" }, orderBy: { createdAt: "desc" } });

beforeEach(async () => {
  await resetDatabase(prisma());
  await prisma().application.create({
    data: {
      id: "app-1",
      company: "Ledgerly",
      tone: "WARM",
      language: "English",
      postingText: "Ledgerly is hiring a Senior Product Designer.",
      documents: { create: [{ kind: "RESUME", units: resume }, { kind: "COVER_LETTER", units: letter }] },
      messages: { create: { role: "AI", text: "Here's what I tailored for Ledgerly.", createdAt: new Date(Date.now() - 60_000) } },
    },
  });
});
afterAll(() => prisma().$disconnect());

describe("refineJob (E8-5)", () => {
  it("applies the edits and saves the reply with them, for Undo", async () => {
    provider.current = reply({ reply: "Trimmed your summary.", edits: [{ document: "RESUME", unitId: "summary", text: "Designer of calm tools." }] });
    const result = await ask("Make the summary shorter");

    const saved = await lastMessage();
    expect(result).toEqual({ messageId: saved.id, edited: [{ document: "RESUME", unitId: "summary" }] });
    // A version of the resume as changed, named by the request (E8-10).
    expect(await prisma().documentVersion.findMany({ select: { cause: true, detail: true } })).toEqual([{ cause: "REFINED", detail: "Make the summary shorter" }]);
    expect(saved).toMatchObject({
      role: "AI",
      text: "Trimmed your summary.",
      writtenWith: "refine-chat@17",
      previousTone: null,
      edits: [{ document: "RESUME", unitId: "summary", text: "Designer of calm tools.", previousText: resume[0].text }],
    });
    expect((await units("RESUME"))[0].text).toBe("Designer of calm tools.");
  });

  it("edits the email, which the model sees once there is one", async () => {
    const email = [
      { id: "to", label: "Recipient", text: "John Doe <john@example.com>" },
      { id: "subject", label: "Subject", text: "Application" },
      { id: "body", label: "Message", text: "Dear John,\n\nHello." },
    ];
    await prisma().document.create({ data: { applicationId: "app-1", kind: "EMAIL", units: email } });
    const mock = reply({ reply: "Shorter now.", edits: [{ document: "EMAIL", unitId: "body", text: "Dear John,\n\nHi." }] });
    provider.current = mock;
    expect(await ask("Make the email shorter")).toMatchObject({ edited: [{ document: "EMAIL", unitId: "body" }] });
    expect(JSON.stringify(mock.calls[0])).toContain("The email's units");
    const saved = await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "EMAIL" } } });
    // The greeting's name is the recipient's, so the fact guard lets it be.
    expect(saved.units).toEqual([email[0], email[1], { ...email[2], text: "Dear John,\n\nHi." }]);
  });

  it("changes the letter's tone and its sign-off, remembering the old tone", async () => {
    provider.current = reply({ reply: "Made it formal.", tone: "FORMAL" });
    await ask("Make it more formal");
    expect(await prisma().application.findUniqueOrThrow({ where: { id: "app-1" } })).toMatchObject({ tone: "FORMAL" });
    expect(await lastMessage()).toMatchObject({ previousTone: "WARM" });
    expect((await units("COVER_LETTER")).at(-1)).toMatchObject({ id: "sign-off", text: "Kind regards," });
  });

  it("keeps documents unchanged when the provider reports a decline", async () => {
    provider.current = reply({
      reply: "Your profile doesn't mention Kubernetes yet, so I've left it out.",
      edits: [{ document: "RESUME", unitId: "summary", text: "Kubernetes expert." }],
      declined: true,
    });
    expect(await ask("Say I know Kubernetes")).toMatchObject({ edited: [] });
    expect(await lastMessage()).toMatchObject({ text: "Your profile doesn't mention Kubernetes yet, so I've left it out.", edits: null });
    expect(await units("RESUME")).toEqual(resume);
  });

  it("saves requested new skills and an empty section without changing the letter", async () => {
    provider.current = reply({ reply: "Applied your changes.", edits: [
      { document: "RESUME", unitId: "skills", text: "Cloud: Kubernetes" },
      { document: "RESUME", unitId: "summary", text: "" },
    ] });
    const result = await ask("Add Kubernetes to skills and clear the summary");
    expect(result.edited).toHaveLength(2);
    expect((await units("RESUME")).find((unit) => unit.id === "skills")?.text).toBe("Cloud: Kubernetes");
    expect((await units("RESUME")).find((unit) => unit.id === "summary")?.text).toBe("");
    expect(await units("COVER_LETTER")).toEqual(letter);
    expect((await lastMessage()).edits).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: "summary", text: "", previousText: resume[0].text }),
    ]));
    expect(await prisma().documentVersion.count()).toBe(1);
    expect(await prisma().skill.count()).toBe(0);
    expect(await prisma().fact.count()).toBe(0);
  });

  it("rejects the full request when a document changed while it worked", async () => {
    provider.current = new MockProvider({
      reply: async () => {
        const edited = resume.map((unit) => (unit.id === "summary" ? { ...unit, text: "Mine" } : unit));
        await prisma().document.update({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } }, data: { units: edited } });
        return { reply: "Tightened it.", edits: [{ document: "RESUME", unitId: "summary", text: "The AI's" }], tone: null, declined: false };
      },
    });
    await expect(ask("Shorter")).rejects.toThrow("document changed while refining");
    expect((await units("RESUME"))[0].text).toBe("Mine");
    expect((await lastMessage()).role).toBe("USER");
  });

  it("sends the conversation so far and the picked unit", async () => {
    const mock = reply({ reply: "Done." });
    provider.current = mock;
    await ask("Mention payments", { target: { document: "RESUME", unitId: "summary" } });
    const messages = mock.calls[0].messages;
    expect(messages.at(-2)).toEqual({ role: "assistant", content: "Here's what I tailored for Ledgerly." });
    expect(messages.at(-1)).toEqual({ role: "user", content: "About Summary (summary): Mention payments" });
  });

  it("never sends private notes to the AI (E8-9)", async () => {
    await prisma().note.create({ data: { applicationId: "app-1", body: "Salary floor: 85k, don't mention it." } });
    const mock = reply({ reply: "Done." });
    provider.current = mock;
    await ask("Make it shorter");
    expect(JSON.stringify(mock.calls)).not.toContain("Salary floor");
  });
});

describe("the letter's contact details (E8-11)", () => {
  it("never sends the sender or signature to the model, and won't edit them", async () => {
    const framed = [
      { id: "sender", label: "Sender", text: "Jane Doe\nsecret-mail@example.com · +31 6 1234 5678" },
      { id: "greeting", label: "Greeting", text: "Dear Ledgerly team," },
      ...letter,
      { id: "signature", label: "Signature", text: "Jane Doe" },
    ];
    await prisma().document.update({ where: { applicationId_kind: { applicationId: "app-1", kind: "COVER_LETTER" } }, data: { units: framed } });
    const mock = reply({
      reply: "Done.",
      edits: [
        { document: "COVER_LETTER", unitId: "sender", text: "Someone else" },
        { document: "COVER_LETTER", unitId: "greeting", text: "Hello Ledgerly team," },
      ],
    });
    provider.current = mock;
    await ask("Make the greeting friendlier");
    const prompt = JSON.stringify(mock.calls[0]);
    expect(prompt).not.toContain("secret-mail@example.com");
    expect(prompt).not.toContain("+31 6 1234 5678");
    expect(prompt).toContain("Dear Ledgerly team,");
    const saved = await units("COVER_LETTER");
    expect(saved.find((unit) => unit.id === "sender")?.text).toBe(framed[0].text);
    expect(saved.find((unit) => unit.id === "greeting")?.text).toBe("Hello Ledgerly team,");
  });
});


it("rejects a legacy evidence job before calling AI or changing documents", async () => {
  const fact = await prisma().fact.create({ data: { applicationId: "app-1", text: "Worked on delivery planning." } });
  const message = await prisma().chatMessage.create({ data: { applicationId: "app-1", role: "USER", text: "Apply evidence" } });
  const mock = reply({ reply: "Do not apply", edits: [{ document: "RESUME", unitId: "summary", text: "Do not save" }] });
  provider.current = mock;
  const legacy = refineJob.input.parse({ applicationId: "app-1", messageId: message.id, request: "Apply evidence", viewing: "RESUME", target: null, evidence: { factId: fact.id, targetUnitId: null } });
  await expect(refineJob.run(legacy, context)).rejects.toThrow("Automatic evidence updates are no longer supported");
  expect(mock.calls).toHaveLength(0);
  expect(await units("RESUME")).toEqual(resume);
  expect(await units("COVER_LETTER")).toEqual(letter);
  expect(await prisma().fact.count()).toBe(1);
  expect(await prisma().documentVersion.count()).toBe(0);
});

it("saves a requested edit without processing failed or pending memory", async () => {
  const source = await prisma().$transaction(tx => recordMemorySource(tx, { sourceKey: "chat:pending", kind: "CHAT", text: "Add Kubernetes", applicationId: "app-1", context: { scope: "GENERAL" } }));
  await prisma().memorySource.update({ where: { id: source.id }, data: { status: "FAILED" } });
  const flagged = resume.map(unit => unit.id === "summary" ? { ...unit, unverified: ["2019"] } : unit);
  await prisma().document.update({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } }, data: { units: flagged } });
  const mock = reply({ reply: "Updated.", edits: [{ document: "RESUME", unitId: "summary", text: "Kubernetes specialist with 25 years of experience." }] });
  provider.current = mock;
  await ask("Say I am a Kubernetes specialist with 25 years of experience");
  expect(mock.calls).toHaveLength(1);
  expect(mock.calls[0].system).toContain("You help a candidate refine");
  const saved = (await units("RESUME")).find(unit => unit.id === "summary")!;
  expect(saved.text).toBe("Kubernetes specialist with 25 years of experience.");
  expect(saved).not.toHaveProperty("unverified");
  const changes = documentChangesSchema.parse((await lastMessage()).documentChanges);
  expect(changes[0].beforeUnits.find(unit => unit.id === "summary")?.unverified).toEqual(["2019"]);
  expect(changes[0].afterUnits.find(unit => unit.id === "summary")).toEqual(saved);
  expect((await prisma().memorySource.findUniqueOrThrow({ where: { id: source.id } })).status).toBe("FAILED");
});

it("does not repeat a completed user-directed edit on retry", async () => {
  const message = await prisma().chatMessage.create({ data: { applicationId: "app-1", role: "USER", text: "Add Kubernetes" } });
  const mock = reply({ reply: "Added.", edits: [{ document: "RESUME", unitId: "skills", text: "Cloud: Kubernetes" }] });
  provider.current = mock;
  const input = { applicationId: "app-1", messageId: message.id, request: "Add Kubernetes", viewing: "RESUME" as const, target: null };
  const result = await refineJob.run(input, context);
  expect(await refineJob.run(input, context)).toEqual({ messageId: result.messageId, edited: [] });
  expect(mock.calls).toHaveLength(1);
  expect(await prisma().documentVersion.count()).toBe(1);
  expect((await units("RESUME")).find(unit => unit.id === "skills")).not.toHaveProperty("unverified");
});

describe("complete local document refinement", () => {
  it("saves formatting, metadata and new sections atomically with complete history", async () => {
    provider.current = reply({ reply: "Updated the resume and letter.", operations: [
      { type: "settings", document: "RESUME", json: '{"theme":{"marginXmm":8},"paper":"LETTER"}' },
      { type: "style", document: "RESUME", target: "document", json: '{"fontSize":11,"lineHeight":1.25}' },
      { type: "metadata", document: "RESUME", path: "experience.e1.role", json: '\"Principal Designer\"' },
      { type: "entry", document: "RESUME", collection: "customSections", action: "upsert", id: "local-awards", json: JSON.stringify({ title: "Awards", format: "LINES", items: [{ id: "local-award", title: "Design award", onResumes: true }] }), beforeId: null },
      { type: "unit", document: "RESUME", action: "upsert", id: "custom-line:local-award", label: "Award", text: "**Design award**", beforeId: null },
      { type: "unit", document: "COVER_LETTER", action: "upsert", id: "paragraph:local-new", label: "New paragraph", text: "A new paragraph.", beforeId: null },
    ] });
    await ask("Change the resume design and add my award; add a letter paragraph");
    const row = await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } } });
    const state = readDocumentState(row.state)!;
    expect(state.theme.marginXmm).toBe(8);
    expect(state.paper).toBe("LETTER");
    expect(state.profile.experience[0].role).toBe("Principal Designer");
    expect(state.styles.document.fontSize).toBe(11);
    expect(state.sections.order).toContain("custom:local-awards");
    expect(documentChangesSchema.parse((await lastMessage()).documentChanges)).toHaveLength(2);
    expect(await prisma().documentVersion.count()).toBe(2);
    expect(await prisma().experience.count()).toBe(0);
    expect(await prisma().theme.count()).toBe(0);
    expect((await units("COVER_LETTER")).at(-1)?.id).toBe("paragraph:local-new");
    const version = await prisma().documentVersion.findFirstOrThrow({ where: { documentId: row.id } });
    expect(readDocumentState(version.state)?.paper).toBe("LETTER");
    provider.current = reply({ reply: "Shorter.", edits: [{ document: "RESUME", unitId: "summary", text: "Principal designer." }] });
    await ask("Shorten the summary");
    const current = await prisma().document.findUniqueOrThrow({ where: { id: row.id } });
    expect(readDocumentState(current.state)?.theme.marginXmm).toBe(8);
    expect(readDocumentState(current.state)?.profile.experience[0].role).toBe("Principal Designer");
  });
  it("rejects an invalid operation without saving its accompanying text edits", async () => {
    provider.current = reply({ reply: "Done.", edits: [{ document: "RESUME", unitId: "summary", text: "Do not save" }], operations: [{ type: "style", document: "RESUME", target: "document", json: '{"fontSize":-1}' }] });
    await expect(ask("Change spacing and summary")).rejects.toThrow();
    expect(await units("RESUME")).toEqual(resume);
    expect(await prisma().documentVersion.count()).toBe(0);
    expect((await prisma().document.findFirstOrThrow({ where: { applicationId: "app-1", kind: "RESUME" } })).state).toBeNull();
  });
  it("leaves inheritance intact when the provider makes no changes", async () => {
    provider.current = reply({ reply: "What would you like to change?" });
    await ask("Hello");
    expect((await prisma().document.findFirstOrThrow({ where: { applicationId: "app-1" } })).state).toBeNull();
    expect(await prisma().documentVersion.count()).toBe(0);
  });
});


it("preserves a theme manually selected while the first local refinement is running", async () => {
  const theme = demoDocumentState().theme;
  await prisma().theme.create({ data: { ...theme, id: "new-theme", builtIn: false } });
  provider.current = new MockProvider({ reply: async () => {
    await prisma().document.update({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } }, data: { themeId: "new-theme" } });
    return { reply: "Updated.", edits: [], operations: [{ type: "settings", document: "RESUME", json: '{"theme":{"marginXmm":8}}' }], tone: null, declined: false };
  } });
  await expect(ask("Reduce margins")).rejects.toThrow("document changed while refining");
  const row = await prisma().document.findFirstOrThrow({ where: { applicationId: "app-1", kind: "RESUME" } });
  expect(row.themeId).toBe("new-theme"); expect(row.state).toBeNull();
});

it("keeps legacy layout language for a section edit and stamps English only after rewriting all prose", async () => {
  const legacy = { ...demoDocumentState(), language: "Arabic" };
  await prisma().document.update({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } }, data: { state: legacy } });
  provider.current = reply({ reply: "Updated summary.", edits: [{ document: "RESUME", unitId: "summary", text: "English summary." }] });
  await ask("Rewrite the summary");
  let row = await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } } });
  expect(readDocumentState(row.state)?.language).toBe("Arabic");
  const current = row.units as typeof resume;
  const prose = current.filter(unit => unit.text.trim() && /^(summary|skills|languages|experience:|project:|education:)/.test(unit.id));
  provider.current = reply({ reply: "Bold formatting applied.", edits: prose.map(unit => ({ document: "RESUME", unitId: unit.id, text: `**${unit.text}**` })) });
  await ask("Bold all resume text");
  row = await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } } });
  expect(readDocumentState(row.state)?.language).toBe("Arabic");
  provider.current = reply({ reply: "Rewritten in English.", edits: prose.map(unit => ({ document: "RESUME", unitId: unit.id, text: `English ${unit.text}` })) });
  await ask("Rewrite the entire resume in English");
  row = await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } } });
  expect(readDocumentState(row.state)?.language).toBe("English");
  const last = await lastMessage();
  const changes = documentChangesSchema.parse(last.documentChanges);
  expect(changes[0].beforeState?.language).toBe("Arabic");
  expect(changes[0].afterState?.language).toBe("English");
});
