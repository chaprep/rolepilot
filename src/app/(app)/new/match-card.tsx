"use client";

import { MatchRows } from "@/components/match-rows";
import { Card } from "@/components/ui/card";
import type { Match, Requirement, ApplicationEvidence, EvidenceOption } from "@/lib/application-data";

/** "How you match" in the new application's review (E7-4), with a word on gaps. */
export function MatchCard({
  match,
  requirements,
  onAddEvidence, evidenceOptions, evidence,
}: {
  match: Match;
  /** The extracted requirements, in the same order as the match's items. */
  requirements: Requirement[];
  onAddEvidence: (evidence: ApplicationEvidence) => Promise<boolean>;
  evidenceOptions: EvidenceOption[];
  evidence: ApplicationEvidence[];
}) {
  return (
    <Card padding="none" className="flex flex-col px-7 pt-6 pb-3">
      <MatchRows match={match} requirements={requirements} onAddEvidence={onAddEvidence} evidenceOptions={evidenceOptions} evidence={evidence} />
      <p className="border-t border-line py-3 text-meta text-muted">
        This compares your profile with the job. Add supporting experience for this application without changing your profile or base resume.
      </p>
    </Card>
  );
}
