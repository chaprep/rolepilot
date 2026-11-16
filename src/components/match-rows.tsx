"use client";

import { useState } from "react";
import { ApplicationEvidenceForm } from "./application-evidence-form";
import { Button } from "@/components/ui/button";
import type { Match, MatchResult, Requirement, ApplicationEvidence, EvidenceOption } from "@/lib/application-data";
import { matchScore } from "@/lib/application-data";
import { cn } from "@/lib/cn";

const MARKS: Record<MatchResult, { mark: string; label: string; className: string }> = {
  covered: { mark: "✓", label: "Covered", className: "border-primary bg-primary text-on-primary" },
  partial: { mark: "~", label: "Partly covered", className: "border-warning-line bg-warning-surface text-warning" },
  gap: { mark: "–", label: "Not covered", className: "border-line-strong text-muted" },
};

/**
 * "How you match" (NEW-4, NEW-5, APP-11): each requirement covered, partly
 * covered or a gap, honestly, and a quick way to add a missing skill. Used
 * in the new application's review (E7-4) and on the Job posting tab (E8-7).
 */
export function MatchRows({
  match,
  requirements,
  onAddEvidence, evidenceOptions = [], evidence = [],
}: {
  match: Match;
  /** The extracted requirements, in the same order as the match's items. */
  requirements: Requirement[];
  onAddEvidence: (evidence: ApplicationEvidence) => Promise<boolean>;
  evidenceOptions?: EvidenceOption[];
  evidence?: ApplicationEvidence[];
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const { hit, total } = matchScore(match);
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3.5">
        <h2 className="text-[15px] font-medium">How you match</h2>
        <p className="text-meta text-muted">
          {hit} of {total} covered by your profile
        </p>
      </div>
      <p className="pb-3 text-meta text-muted">This compares your profile. Application-only evidence may already be demonstrated in the tailored resume.</p>
      <ul aria-label="Requirements">
        {match.items.map((item, index) => {
          const { mark, label, className } = MARKS[item.result];
          const skill = requirements[index]?.kind === "skill" ? requirements[index].skill : null;
          return (
            <li key={index} className="flex items-start gap-3.5 border-t border-line py-[13px]">
              <span aria-hidden className={cn("grid size-[22px] flex-none place-items-center rounded-full border text-xs font-semibold", className)}>
                {mark}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-field">
                  <span className="sr-only">{label}: </span>
                  {item.requirement}
                </p>
                {item.note && <p className="text-meta text-muted">{item.note}</p>}
                {editing === index && skill && <ApplicationEvidenceForm key={index} skill={skill} index={index} options={evidenceOptions} initial={evidence.find((entry) => entry.requirementIndex === index)} onSave={onAddEvidence} onCancel={() => setEditing(null)} />}
              </div>
              {skill && (
                <Button variant="secondary" size="sm" className="flex-none" onClick={() => setEditing(editing === index ? null : index)}>
                  {evidence.some((entry) => entry.requirementIndex === index) ? "Edit application evidence" : "Add for this application"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
