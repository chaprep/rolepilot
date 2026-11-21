import { z } from "zod";

export const attributionSchema = z.object({
  unitId: z.string().max(200).nullable(),
  label: z.string().max(400),
  scope: z.enum(["GLOBAL", "LOCAL", "GENERAL", "UNRESOLVED"]),
});
export const memoryClaimSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  quote: z.string().trim().min(3).max(2000),
  kind: z.enum(["EXPERIENCE", "ACHIEVEMENT", "CAPABILITY", "PREFERENCE", "LIMITATION"]),
  subject: z.string().max(200),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(20),
  unitId: z.string().max(200).nullable(),
  replaces: z.string().nullable(),
  conflicts: z.array(z.string()).max(10),
});
export const extractionSchema = z.object({ claims: z.array(memoryClaimSchema).max(20), clarifications: z.array(z.string().min(1).max(300)).max(5).nullable().optional() });
export type MemoryClaim = z.infer<typeof memoryClaimSchema>;
export const contextSchema = z.object({
  label: z.string().max(400).default(""),
  unitId: z.string().max(200).nullable().default(null),
  scope: z.enum(["GLOBAL", "LOCAL", "GENERAL", "UNRESOLVED"]).default("GENERAL"),
  correctionId: z.string().nullable().default(null),
  correctionRevision: z.number().int().nullable().default(null),
  suppressionHash: z.string().max(100).optional(),
});
export const normalized = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
/** Source text is evidence, never a way around private-field restrictions. */
export function privateMemory(text: string): boolean {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\b(?:phone|email|date of birth|passport|street address|credential id)\b|(?:\+\d[\d ()-]{8,}\d)/i.test(text);
}
export function supportedClaim(claim: MemoryClaim, text: string, previousText = ""): boolean {
  return normalized(text).includes(normalized(claim.quote)) && !privateMemory(claim.text + " " + claim.quote)
    && (!previousText || !normalized(previousText).includes(normalized(claim.quote)));
}

export function redactMemoryInput(text: string): string {
  return text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[private]")
    .replace(/https?:\/\/\S+/gi, "[private]")
    .replace(/\+\d[\d ()-]{8,}\d/g, "[private]")
    .split("\n").map(line => /\b(?:date of birth|passport|street address|reference contact)\b/i.test(line) ? "[private]" : line).join("\n");
}

const date = z.coerce.date();
const nullableText = z.string().nullable();
export const memoryExportSchema = z.object({
  state: z.object({ id: z.literal("memory"), revision: z.number().int().min(0), nextSourceSequence: z.number().int().min(0), profileEpoch: z.number().int().min(0), fingerprintKey: z.string().min(16).max(200), paused: z.boolean(), backfill: z.unknown().nullable() }).nullable(),
  facts: z.array(z.object({ id: z.string(), text: z.string().max(1000), kind: z.enum(["EXPERIENCE", "ACHIEVEMENT", "CAPABILITY", "PREFERENCE", "LIMITATION"]), status: z.enum(["ACTIVE", "SUPERSEDED", "CONFLICTED", "FORGOTTEN", "WITHDRAWN"]), fingerprint: z.string().max(200), subject: z.string().max(200), capabilities: z.array(z.string().max(100)).max(20), experienceId: nullableText, projectId: nullableText, attribution: attributionSchema, supersededById: nullableText, revision: z.number().int().min(1), assertedAt: date, createdAt: date, updatedAt: date })),
  sources: z.array(z.object({ id: z.string(), sourceKey: z.string().max(300), revision: z.number().int().min(1), sequence: z.number().int().min(1), kind: z.string().max(40), text: z.string().max(10000), previousText: z.string().max(10000), context: contextSchema, status: z.enum(["PENDING", "PROCESSING", "DONE", "FAILED", "SUPPRESSED", "NEEDS_CONTEXT"]), error: nullableText, extraction: extractionSchema.nullable(), extractedWith: nullableText, attempts: z.number().int().min(0), profileEpoch: z.number().int().min(0), applicationId: nullableText, messageId: nullableText, factId: nullableText, documentId: nullableText, submittedAt: date, createdAt: date, processedAt: date.nullable() })),
  evidence: z.array(z.object({ sourceId: z.string(), memoryFactId: z.string(), quote: z.string().max(2000), active: z.boolean() })),
});
export type MemoryExport = z.infer<typeof memoryExportSchema>;
