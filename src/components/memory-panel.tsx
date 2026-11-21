"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import { toast } from "@/components/toast";
import { clarifyMemory, correctRememberedFact, forgetRememberedFact, listMemories, pauseMemory, retryMemory } from "@/lib/memory/actions";

type MemoryPage = Extract<Awaited<ReturnType<typeof listMemories>>, { ok: true }>["data"];
export function MemoryPanel() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<MemoryPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [contextUnitId, setContextUnitId] = useState("");
  const refresh = useCallback(async () => {
    try { const result = await listMemories({ page });
      if (result.ok) { setData(result.data); setError(""); } else setError(result.error);
    } catch { setError("Could not load remembered information. Refresh to retry."); }
  }, [page]);
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 10000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [refresh]);
  async function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try { const result = await work(); if (!result.ok) toast(result.error ?? "Could not update remembered information."); else { setEditing(null); await refresh(); } }
    finally { setBusy(false); }
  }
  const backfillRemaining = data?.backfill && typeof data.backfill === "object" && !Array.isArray(data.backfill) ? data.backfill.remaining : null;
  return <section className="mt-8 flex flex-col gap-4" aria-labelledby="remembered-heading">
    <h3 id="remembered-heading" className="font-medium">Automatically remembered</h3>
    <p className="max-w-prose text-sm text-muted">Information you supply in applications is remembered for future applications. Your profile and saved documents stay as you wrote them. Forgetting stops reuse; original chats and documents remain.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading remembered information…</p>}
    {data && <>
      <p className="text-sm text-muted" role="status">{data.count} remembered · {data.pending} processing · {data.failed} need retry{data.paused ? " · Memory is paused" : ""}</p>
      {typeof backfillRemaining === "number" && backfillRemaining > 0 && <p className="text-sm text-muted" role="status">{backfillRemaining} earlier submissions waiting for background processing.</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => pauseMemory({ paused: !data.paused }))}>{data.paused ? "Resume memory" : "Pause memory"}</Button>
        {data.failed > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => retryMemory({}))}>Retry processing</Button>}
      </div>
      {data.count === 0 && <p className="text-sm text-muted">New experience and examples you submit will appear here after processing. Earlier application messages and evidence are processed in the background.</p>}
      {data.questions?.map(question => <form key={question.id} className="flex flex-col gap-2" onSubmit={event => {
        event.preventDefault();
        const answer = String(new FormData(event.currentTarget).get("answer") ?? "");
        void run(() => clarifyMemory({ sourceId: question.id, answer }));
      }}>
        <label htmlFor={`question-${question.id}`} className="text-sm">{question.error}</label>
        <input id={`question-${question.id}`} name="answer" className={controlClassName} required minLength={3} maxLength={1000} />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>Clarify information</Button>
      </form>)}
      <ul className="flex flex-col gap-4">
        {data.facts.map(fact => <li key={fact.id} className="flex flex-col gap-2 border-t border-line pt-4">
          {editing === fact.id ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void run(() => correctRememberedFact({ id: fact.id, revision: fact.revision, text, unitId: contextUnitId || null })); }}>
            <label htmlFor={`memory-${fact.id}`} className="text-sm">Correct remembered information</label>
            <textarea id={`memory-${fact.id}`} className={controlClassName} value={text} maxLength={1000} required rows={3} onChange={event => setText(event.target.value)} />
            <label htmlFor={`context-${fact.id}`} className="text-sm">Work context</label>
            <select id={`context-${fact.id}`} className={controlClassName} value={contextUnitId} onChange={event => setContextUnitId(event.target.value)}>
              <option value="">General information; do not assign to a role or project</option>
              {(data.contexts ?? []).map(context => <option key={context.id} value={context.id}>{context.label}</option>)}
            </select>
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>Save correction</Button><Button type="button" size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
          </form> : <p className="max-w-prose whitespace-pre-wrap text-sm">{fact.text}</p>}
          {fact.context && <p className="text-sm text-muted">{fact.context}{fact.detached ? " · Original role or project is no longer linked" : ""}</p>}
          {fact.status === "CONFLICTED" && <p role="status" className="text-sm">Conflicting information is withheld from future drafts. Correct it or forget it.</p>}
          <details className="text-sm"><summary>Sources</summary><ul className="mt-2 flex flex-col gap-2">{fact.evidence.map((source, index) => <li key={index}><q>{source.quote}</q>{source.applicationId && <> · <Link href={`/applications/${source.applicationId}`}>Open application</Link></>}</li>)}</ul></details>
          <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => { setEditing(fact.id); setText(fact.text); setContextUnitId((data.contexts ?? []).some(context => context.id === fact.contextUnitId) ? fact.contextUnitId ?? "" : ""); }}>Correct</Button><Button size="sm" variant="danger-text" disabled={busy} onClick={() => void run(() => forgetRememberedFact({ id: fact.id, revision: fact.revision }))}>Forget</Button></div>
        </li>)}
      </ul>
      {data.count > 20 && <div className="flex items-center gap-3"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">Page {page + 1}</span><Button size="sm" variant="secondary" disabled={(page + 1) * 20 >= data.count} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </>}
  </section>;
}
