import { z } from "zod";

const publicLink = z.url({ protocol: /^https?$/ }).max(2048).refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password;
});
export const relationships = ["confirmed_hiring_manager", "opening_contact", "likely_team_lead", "relevant_recruiter"] as const;
const shortText = z.string().trim().min(1).max(160).regex(/^[^\r\n]+$/u);
const sourceSchema = z.object({
  url: publicLink,
  title: z.string().max(200),
  excerpt: z.string().min(1).max(600),
});
const contactSchema = z.object({
  id: z.string().min(1).max(128),
  name: shortText,
  title: shortText,
  relationship: z.enum(relationships),
  reason: z.string().trim().min(1).max(320),
  linkedinUrl: publicLink.nullable(),
  sources: z.array(sourceSchema).min(1).max(3),
});
const metadata = {
  version: z.literal(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  searchedAt: z.iso.datetime(),
  partial: z.boolean(),
};
export const peopleResearchSchema = z.discriminatedUnion("status", [
  z.object({ ...metadata, status: z.literal("found"), contacts: z.array(contactSchema).min(1).max(3) }),
  z.object({ ...metadata, status: z.enum(["needs_company", "no_reliable_contacts"]), contacts: z.tuple([]) }),
]);
export type PeopleResearch = z.infer<typeof peopleResearchSchema>;
export type HiringContact = z.infer<typeof contactSchema>;
