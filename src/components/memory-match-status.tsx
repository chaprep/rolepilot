"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { matchMemoryStatus, refreshMemoryMatch } from "@/lib/memory/actions";

export function MemoryMatchStatus({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void matchMemoryStatus({ applicationId }).then(result => { if (active && result.ok) setStale(result.data.stale); }).catch(() => {});
    return () => { active = false; };
  }, [applicationId]);
  if (!stale) return null;
  return <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
    <p>This match predates your current remembered information.</p>
    <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const result = await refreshMemoryMatch({ applicationId }); if (result.ok) { setStale(false); router.refresh(); } else toast(result.error); }
      finally { setBusy(false); }
    }}>{busy ? "Refreshing…" : "Refresh match"}</Button>
  </div>;
}
