import "server-only";

import { createHash } from "node:crypto";

import type { AIProvider } from "@/lib/ai/provider";
import { extractedOf, type Extracted } from "@/lib/application-data";
import type { JobContext } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";
import { decryptSecret, ZYTE_KEY } from "@/lib/secrets";
import type { SettingsData } from "@/lib/settings";

import { researchCompany, reuseResearch, type CompanyResearch, type ResearchInput } from ".";
import { publicWebUrl } from "./zyte";

export function researchInput({ extracted, posting, postingUrl, website }: {
  extracted: Extracted; posting: string; postingUrl?: string; website?: string;
}): ResearchInput {
  const postingHost = postingUrl ? publicWebUrl(postingUrl)?.hostname : undefined;
  return {
    company: extracted.company ?? "",
    role: extracted.role || extracted.title || "",
    website,
    jobContext: [postingHost && `Posting site: ${postingHost}`, extracted.location && `Location: ${extracted.location}`, ...extracted.requirements.map(({ text }) => text)].filter(Boolean).join("\n"),
    contextRevision: createHash("sha256").update(posting.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).digest("hex"),
  };
}

type ApplicationContext = Parameters<typeof extractedOf>[0] & {
  postingUrl: string; postingText: string; companyResearch: unknown; startup?: { website: string } | null;
};

export function applicationResearchInput(application: ApplicationContext): ResearchInput {
  const extracted = { ...extractedOf(application), company: application.company, role: application.role, title: application.title, location: application.location || null };
  return researchInput({ extracted, posting: application.postingText, postingUrl: application.postingUrl, website: application.startup?.website });
}

export function researchForEdits(application: ApplicationContext): CompanyResearch | undefined {
  return reuseResearch(applicationResearchInput(application), application.companyResearch);
}

export async function researchForWriting(input: ResearchInput, settings: SettingsData, provider: AIProvider, { signal, step }: JobContext, saved?: unknown, force = false) {
  signal.throwIfAborted();
  if (!settings.companyResearchEnabled) return;
  if (!force) {
    const cached = reuseResearch(input, saved);
    if (cached) return cached;
  }
  let apiKey: string | null = null;
  if (settings.zyteKeyEnc && settings.zyteVerified) {
    try { apiKey = decryptSecret(ZYTE_KEY, settings.zyteKeyEnc); } catch { /* The settings screen can replace an unreadable key. */ }
  }
  return researchCompany(input, { provider, apiKey, progress: step, signal });
}

export async function saveApplicationResearch(application: { id: string; updatedAt: Date }, research: CompanyResearch): Promise<boolean> {
  const { count } = await prisma.application.updateMany({ where: { id: application.id, updatedAt: application.updatedAt }, data: { companyResearch: research } });
  return count === 1;
}
