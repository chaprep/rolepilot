"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useJob } from "@/hooks/use-job";
import type { CompanyResearch } from "@/lib/research/schema";

import { startRefreshingResearch } from "./actions";

export type ResearchPanelData = {
  enabled: boolean;
  jobId: string | null;
  saved: Pick<CompanyResearch, "status" | "sources"> | undefined;
};

const statusLabels = { complete: "Research complete", partial: "Partial research", unavailable: "Research unavailable" };

export function ResearchPanel({ applicationId, data }: { applicationId: string; data: ResearchPanelData }) {
  const router = useRouter();
  const [jobId, setJobId] = useState(data.jobId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const job = useJob(jobId, 0, (update) => {
    if (update.status === "FAILED") setError(update.error ?? "The refresh couldn’t be completed.");
    if (update.status === "DONE" || update.status === "FAILED") {
      setJobId(null);
      router.refresh();
    }
  });

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Company research</h2>
        {data.enabled && (
          <Button size="sm" variant="secondary" disabled={pending || !!jobId} onClick={() => startTransition(async () => {
            setError("");
            const result = await startRefreshingResearch({ id: applicationId });
            if (result.ok) setJobId(result.data);
            else setError(result.error);
          })}>Refresh research</Button>
        )}
      </div>
      <p role="status" className="text-sm text-muted">
        {jobId ? `${job?.step ?? "Preparing research"}…` : data.saved ? statusLabels[data.saved.status] : "No company research saved"}
      </p>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {!!data.saved?.sources.length && (
        <ul aria-label="Company research sources" className="list-disc pl-5 text-sm">
          {data.saved.sources.map((source) => (
            <li key={source.id}><a className="break-words underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title || new URL(source.url).hostname}</a></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
