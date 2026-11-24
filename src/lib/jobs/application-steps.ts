import type { DocumentsToWrite } from "@/lib/settings";

// The named steps of the new application flow's jobs (NEW-2, NEW-7), shared
// by the jobs that report them and the page that shows them.

export const READ_POSTING_STEPS = [
  "Reading the posting",
  "Picking out the role, company and requirements",
  "Comparing it with your profile",
] as const;

export const TAILOR_RESUME_STEP = "Tailoring your resume";
export const RESEARCH_COVER_LETTER_STEP = "Researching the company";
export const WRITE_COVER_LETTER_STEP = "Writing your cover letter";
export const SAVE_APPLICATION_STEP = "Saving the application";
export const WRITE_DOCUMENTS_STEPS = [TAILOR_RESUME_STEP, RESEARCH_COVER_LETTER_STEP, WRITE_COVER_LETTER_STEP, SAVE_APPLICATION_STEP] as const;

export function writeDocumentSteps(write: DocumentsToWrite) {
  if (write === "resume") return [TAILOR_RESUME_STEP, SAVE_APPLICATION_STEP];
  if (write === "letter") return [RESEARCH_COVER_LETTER_STEP, WRITE_COVER_LETTER_STEP, SAVE_APPLICATION_STEP];
  return WRITE_DOCUMENTS_STEPS;
}
