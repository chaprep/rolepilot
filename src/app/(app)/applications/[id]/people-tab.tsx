"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/use-job";
import { cancel } from "@/lib/jobs/actions";
import type { PeopleResearch } from "@/lib/people/schema";

import { startPeopleSearch, undoHiringContact, applyHiringContact } from "./people-actions";

type Draft = "COVER_LETTER" | "EMAIL";
type GreetingChange = { target: Draft; previous: string | null; updated: string };
export type PeopleSearch = {
  saved: PeopleResearch | null;
  postingFingerprint: string;
  activeJob: string | null;
  previousError: string | null;
};

const draftLabels = { COVER_LETTER: "cover letter", EMAIL: "email" } as const;
const relationshipLabels = {
  confirmed_hiring_manager: "Confirmed hiring manager",
  opening_contact: "Connected to this opening",
  likely_team_lead: "Likely team lead",
  relevant_recruiter: "Relevant recruiter",
} as const;

export function PeopleTab({ applicationId, search, drafts }: {
  applicationId: string; search?: PeopleSearch; drafts: Partial<Record<Draft, string | null>>;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState(search?.activeJob ?? null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [greetingChange, setGreetingChange] = useState<GreetingChange | null>(null);
  const job = useJob<PeopleResearch>(jobId, 0, (update) => {
    if (update.status === "DONE") router.refresh();
  });
  const result = job?.result ?? search?.saved;
  const stale = Boolean(result && search && result.fingerprint !== search.postingFingerprint);
  const searching = Boolean(jobId && job?.status !== "DONE" && job?.status !== "FAILED");
  const failure = error ?? job?.error ?? (!jobId ? search?.previousError : null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await startPeopleSearch({ id: applicationId });
      if (outcome.ok) {
        setJobId(outcome.data);
        router.refresh();
      } else setError(outcome.error);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!jobId) return;
    const outcome = await cancel({ id: jobId });
    if (!outcome.ok) setError(outcome.error);
  }

  async function apply(target: Draft, contactId: string) {
    if (!result || stale) return;
    setBusy(true);
    setError(null);
    try {
      const expected = drafts[target] ?? null;
      const outcome = await applyHiringContact({ id: applicationId, target, contactId, searchedAt: result.searchedAt, expected });
      if (outcome.ok) {
        if (outcome.data.previous !== outcome.data.updated) setGreetingChange({ target, ...outcome.data });
        setMessage(`Updated the ${draftLabels[target]} greeting.`);
        router.refresh();
      } else {
        setError(outcome.error);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!greetingChange) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await undoHiringContact({ id: applicationId, ...greetingChange });
      if (outcome.ok) {
        setGreetingChange(null);
        setMessage("Restored the previous greeting.");
        router.refresh();
      } else setError(outcome.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center overflow-auto bg-canvas px-4 py-8 sm:px-10 sm:pt-11 sm:pb-16">
      <section className="flex w-full max-w-[560px] flex-col items-start gap-3 rounded-panel border border-line-card bg-card px-7 py-7">
        <h2 className="product-heading text-section">Hiring contacts</h2>
        <p className="text-sm text-muted">
          I’ll look for people involved in hiring for this role and show the sources that connect them to the opening.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button disabled={busy || searching} onClick={() => void start()}>{result ? "Search again" : failure ? "Try again" : "Find hiring contacts"}</Button>
          {searching && <Button variant="secondary" onClick={() => void stop()}>Cancel</Button>}
        </div>
        {searching && <p role="status" className="text-sm text-muted">{job?.step ?? "Starting the search…"}</p>}
        {failure && (
          <p role="alert" className="text-sm">
            {failure} {failure.includes("Settings") && <Link href="/settings?section=ai" className="underline">Open AI settings</Link>}
          </p>
        )}
        {stale && <p className="text-sm text-muted">The posting changed. Search again before using these contacts.</p>}
        {result?.partial && result.status === "found" && <p className="text-sm text-muted">Some sources were unavailable during this search.</p>}
        {result?.status === "needs_company" && <p className="text-sm text-muted">Confirm the employer in the application details, then search again.</p>}
        {result?.status === "no_reliable_contacts" && <p className="text-sm text-muted">No reliable hiring contacts were found for this opening.</p>}
        {result?.status === "found" && (
          <ul className="w-full divide-y divide-line-card">
            {result.contacts.map((person) => (
              <li key={person.id} className="flex flex-col gap-2 py-3">
                <h3 className="font-medium">{person.name}</h3>
                <p className="text-sm text-muted">{person.title} · {relationshipLabels[person.relationship]}</p>
                <p className="text-sm">{person.reason}</p>
                {person.linkedinUrl && <a className="w-fit text-sm underline" href={person.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn profile</a>}
                <ul className="list-disc pl-4 text-sm">
                  {person.sources.map((source, index) => (
                    <li key={source.url + index}>
                      <a className="underline" href={source.url} target="_blank" rel="noreferrer">{source.title || "Supporting source"}</a>
                      <p className="text-muted">{source.excerpt}</p>
                    </li>
                  ))}
                </ul>
                {!stale && <div className="flex flex-wrap gap-2">
                  {(["COVER_LETTER", "EMAIL"] as const).filter((draft) => draft in drafts).map((draft) => (
                    <Button key={draft} variant="secondary" disabled={busy || searching} onClick={() => void apply(draft, person.id)}>
                      Use in {draftLabels[draft]}
                    </Button>
                  ))}
                </div>}
              </li>
            ))}
          </ul>
        )}
        {message && <p role="status" className="text-sm">{message}</p>}
        {greetingChange && <Button variant="text" disabled={busy} onClick={() => void undo()}>Undo greeting change</Button>}
      </section>
    </div>
  );
}
