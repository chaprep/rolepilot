"use client";

import { useState } from "react";
import { applicationEvidenceSchema, type ApplicationEvidence, type EvidenceOption } from "@/lib/application-data";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";

export function ApplicationEvidenceForm({ skill, index, options, initial, onSave, onCancel }: {
  skill: string;
  index: number;
  options: EvidenceOption[];
  initial?: ApplicationEvidence;
  onSave: (evidence: ApplicationEvidence) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [text, setText] = useState(initial?.text ?? "");
  const [targetUnitId, setTarget] = useState(initial?.targetUnitId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form aria-label={`Supporting experience for ${skill}`} className="mt-3 flex flex-col gap-3 rounded-card border border-line p-4" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      const parsed = applicationEvidenceSchema.safeParse({ id, requirementIndex: index, text, targetUnitId: targetUnitId || null });
      if (!parsed.success) return setError(parsed.error.issues[0].message);
      setError(null);
      setSaving(true);
      try { if (await onSave(parsed.data)) onCancel(); }
      catch { setError("Could not save this evidence. Your text is still here; try again."); }
      finally { setSaving(false); }
    }}>
      <p className="text-sm font-medium">{skill}</p>
      <Textarea label="Supporting experience" hint="Describe what you did and where you used this skill. Only this application changes; an existing resume updates automatically." rows={3} maxLength={800} value={text} onChange={(event) => setText(event.target.value)} autoFocus />
      <Select label="Role or project (optional)" value={targetUnitId} onChange={(event) => setTarget(event.target.value)}>
        <option value="">General capability</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </Select>
      {error && <p role="alert" className="text-sm text-warning">{error}</p>}
      <p className="text-meta text-muted">The profile and base resume stay unchanged. Undoing a resume update keeps this evidence available.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={saving}>{saving ? "Saving…" : "Save for this application"}</Button>
        <Button type="button" variant="text" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
