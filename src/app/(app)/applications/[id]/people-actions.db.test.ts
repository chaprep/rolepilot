import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { getSession } from "@/lib/auth/session";
import { postingFingerprint } from "@/lib/jobs/find-hiring-contacts";
import { cancelJob, getJob } from "@/lib/jobs/runner";
import { loadOneSetup } from "@/lib/one/config";
import type { PeopleResearch } from "@/lib/people/schema";
import { createTestClient, resetDatabase } from "@/test/db";

import { startPeopleSearch, undoHiringContact, applyHiringContact } from "./people-actions";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return db.client; } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/one/config", () => ({ loadOneSetup: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const agent = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/ai/tasks/find-hiring-contacts", () => ({ findHiringContacts: agent.run }));
vi.mock("@/lib/ai", async (original) => ({
  ...await original<typeof import("@/lib/ai")>(),
  getAiProvider: async () => ({ toolTurn: vi.fn() }),
}));

db.client = createTestClient();
const prisma = db.client;
const posting = { company: "Ledgerly", role: "Designer", location: "", postingUrl: "", postingText: "Designer for the growth team." };
const people: PeopleResearch = {
  version: 1, fingerprint: postingFingerprint(posting), searchedAt: "2026-11-22T08:00:00.000Z",
  status: "found", partial: false, contacts: [{
    id: "contact-1", name: "Maya Rao", title: "Design Director", relationship: "likely_team_lead",
    reason: "Maya leads the Growth Design team.", linkedinUrl: null,
    sources: [{ url: "https://ledgerly.example/team", title: "Team at Ledgerly", excerpt: "Maya Rao leads Growth Design." }],
  }],
};
const originalBody = "Hi,\n\nThe rest of the email.\n\nBest,\nSam";
const emailUnit = (id: string, label: string, text: string) => ({ id, label, text });

beforeEach(async () => {
  await resetDatabase(prisma);
  vi.mocked(getSession).mockResolvedValue({ persistent: false, issuedAt: new Date(), expiresAt: new Date() });
  vi.mocked(loadOneSetup).mockResolvedValue({ connectionKey: "exa", muapiConnectionKey: "muapi", reference: "test-grant" } as Awaited<ReturnType<typeof loadOneSetup>>);
  agent.run.mockReset().mockResolvedValue(people);
  await prisma.application.create({ data: {
    id: "application-1", ...posting, peopleResearch: people,
    documents: { create: [
      { kind: "EMAIL", units: [emailUnit("to", "Recipient", "keep@example.com"), emailUnit("subject", "Subject", "Keep this subject"), emailUnit("body", "Message", originalBody)] },
      { kind: "COVER_LETTER", units: [{ id: "paragraph:1", label: "Opening", text: "Keep this paragraph." }] },
    ] },
  } });
});
afterAll(() => prisma.$disconnect());

const read = (kind: "EMAIL" | "COVER_LETTER") => prisma.document.findUniqueOrThrow({
  where: { applicationId_kind: { applicationId: "application-1", kind } },
});

it("applies first-name greetings and undoes them without rewriting the body or recipient", async () => {
  const input = { id: "application-1", contactId: "contact-1", searchedAt: people.searchedAt };
  const email = await applyHiringContact({ ...input, target: "EMAIL", expected: originalBody });
  expect(email).toMatchObject({ ok: true, data: { updated: originalBody.replace("Hi,", "Hi Maya,") } });
  expect(await read("EMAIL")).toMatchObject({ units: [
    emailUnit("to", "Recipient", "keep@example.com"), emailUnit("subject", "Subject", "Keep this subject"),
    emailUnit("body", "Message", originalBody.replace("Hi,", "Hi Maya,")),
  ] });
  expect(await applyHiringContact({ ...input, target: "COVER_LETTER", expected: null })).toMatchObject({ ok: true });
  expect(await read("COVER_LETTER")).toMatchObject({ units: [
    { id: "greeting", text: "Dear Maya," }, { id: "paragraph:1", text: "Keep this paragraph." },
  ] });
  if (!email.ok) throw new Error(email.error);
  expect(await undoHiringContact({ id: input.id, target: "EMAIL", ...email.data })).toMatchObject({ ok: true });
  expect(await read("EMAIL")).toMatchObject({ units: expect.arrayContaining([emailUnit("body", "Message", originalBody)]) });
});

it("prevents applying results to a changed posting or an edited draft", async () => {
  const input = { id: "application-1", contactId: "contact-1", searchedAt: people.searchedAt, target: "EMAIL" as const };
  expect(await applyHiringContact({ ...input, expected: "Outdated draft" })).toMatchObject({ ok: false, error: expect.stringContaining("draft changed") });
  await prisma.application.update({ where: { id: input.id }, data: { postingText: "Another opening" } });
  expect(await applyHiringContact({ ...input, expected: originalBody })).toMatchObject({ ok: false, error: expect.stringContaining("out of date") });
});

it("deduplicates active searches and saves successful results with the application", async () => {
  let finish!: () => void;
  agent.run.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(people); }));
  const [first, second] = await Promise.all([startPeopleSearch({ id: "application-1" }), startPeopleSearch({ id: "application-1" })]);
  expect(first).toEqual(second);
  if (!first.ok) throw new Error(first.error);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledTimes(1));
  await prisma.application.update({ where: { id: "application-1" }, data: { peopleResearch: people } });
  finish();
  await vi.waitFor(async () => expect(await getJob(first.data)).toMatchObject({ status: "DONE" }));
  await prisma.job.delete({ where: { id: first.data } });
  expect(await prisma.application.findUnique({ where: { id: "application-1" } })).toMatchObject({
    peopleResearch: { status: "found", searchedAt: expect.not.stringMatching(people.searchedAt) },
  });
});

it("keeps the previous successful result when the posting changes mid-search", async () => {
  agent.run.mockImplementation(async () => {
    await prisma.application.update({ where: { id: "application-1" }, data: { postingText: "A different opening." } });
    return people;
  });
  const start = await startPeopleSearch({ id: "application-1" });
  if (!start.ok) throw new Error(start.error);
  await vi.waitFor(async () => expect(await getJob(start.data)).toMatchObject({ status: "FAILED", error: expect.stringContaining("posting changed") }));
  expect(await prisma.application.findUnique({ where: { id: "application-1" } })).toMatchObject({ peopleResearch: people });
});

it("cancels an in-flight refresh without replacing the previous results", async () => {
  agent.run.mockImplementation(async (_tool, _posting, { signal }: { signal: AbortSignal }) => {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    return people;
  });
  const start = await startPeopleSearch({ id: "application-1" });
  if (!start.ok) throw new Error(start.error);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledOnce());
  await cancelJob(start.data);
  await vi.waitFor(async () => expect(await getJob(start.data)).toMatchObject({ status: "FAILED", error: "Cancelled." }));
  expect(await prisma.application.findUnique({ where: { id: "application-1" } })).toMatchObject({ peopleResearch: people });
});
