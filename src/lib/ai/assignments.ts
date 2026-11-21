import type { UsageTask } from "@/lib/usage";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";
export const LUNA = "openai/gpt-6-luna";
export const SONNET = "anthropic/claude-sonnet-5.5";
export const JEV = "typesafe/jev-1.14";
export const MODEL_ASSIGNMENTS = [
  { task: "extract-memory", label: "Remember candidate facts", model: LUNA },
  { task: "select-memory", label: "Select remembered facts", model: LUNA },
  { task: "extract-profile", label: "Import profile", model: LUNA },
  { task: "extract-posting", label: "Extract job details", model: LUNA },
  { task: "match-requirements", label: "Match requirements", model: LUNA },
  { task: "classify-reply", label: "Classify employer replies", model: LUNA },
  { task: "write-email", label: "Draft application emails", model: LUNA },
  { task: "draft-reply", label: "Draft employer replies", model: LUNA },
  { task: "tailor-resume", label: "Tailor resume", model: SONNET },
  { task: "write-cover-letter", label: "Write cover letter", model: SONNET },
  { task: "refine-chat", label: "Edit through chat", model: SONNET },
  { task: "regenerate-unit", label: "Rewrite sections", model: SONNET },
] as const satisfies readonly { task: UsageTask; label: string; model: string }[];

export function modelForTask(task: UsageTask): string {
  if (task === "research-company") return modelForTask("write-cover-letter");
  const assignment = MODEL_ASSIGNMENTS.find((entry) => entry.task === task);
  if (!assignment) throw new Error(`No generation model assigned to ${task}`);
  return assignment.model;
}
