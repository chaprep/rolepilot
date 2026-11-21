import { z } from "zod";

const sourceUrl = z.url({ protocol: /^https?$/ }).max(2048).refine((value) => {
  const url = URL.parse(value);
  return !!url && !url.username && !url.password;
});
const sourceId = z.string().regex(/^S[1-5]$/);
const finding = z.object({
  text: z.string().trim().min(1).max(500),
  sourceId,
  excerpt: z.string().trim().min(12).max(600),
});

export const researchAnswerSchema = z.object({
  identity: z.object({ name: z.string().trim().min(1).max(200), sourceId }).nullable(),
  findings: z.array(finding).max(10),
});

export const companyResearchSchema = researchAnswerSchema.extend({
  version: z.literal(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["complete", "partial", "unavailable"]),
  warning: z.enum([
    "deadline", "unsupported-provider", "missing-key", "credentials", "search-configuration", "rate-limit",
    "network", "request-timeout", "response-too-large", "invalid-response", "page-unavailable",
    "invalid-url", "budget", "model-unavailable", "unverified-company", "no-findings",
  ]).nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  requests: z.object({ search: z.number().int().min(0).max(3), extract: z.number().int().min(0).max(5) }),
  sources: z.array(z.object({ id: sourceId, title: z.string().max(240), url: sourceUrl, retrievedAt: z.iso.datetime() })).max(5),
}).refine(({ identity, findings, sources, status }) =>
  status === "unavailable"
    ? !identity && !findings.length && !sources.length
    : !!identity && findings.length > 0 && [identity.sourceId, ...findings.map((finding) => finding.sourceId)].every((id) => sources.some((source) => source.id === id)),
);

export type ResearchWarning = NonNullable<CompanyResearch["warning"]>;
export type CompanyResearch = z.infer<typeof companyResearchSchema>;

export function savedCompanyResearch(value: unknown): CompanyResearch | undefined {
  const result = companyResearchSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
