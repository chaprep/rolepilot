"use client";

import { useState } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { toastResult } from "@/components/toast";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Toggle } from "@/components/ui/toggle";
import type { Creativity } from "@/generated/prisma/enums";

import { updateSettings } from "./actions";

type Behaviour = { creativity: Creativity; strict: boolean; showDiff: boolean };

const CREATIVITY_OPTIONS: { value: Creativity; label: string }[] = [
  { value: "FAITHFUL", label: "Faithful" },
  { value: "BALANCED", label: "Balanced" },
  { value: "OPTIMIZED", label: "Optimized" },
];

/**
 * How the AI writes (E10-2, SET-3 to SET-5), below the provider form. Each
 * control saves as it changes.
 */
export function AiBehaviour({ initial }: { initial: Behaviour }) {
  const track = useTrackSave();
  const [behaviour, setBehaviour] = useState(initial);

  const change = (next: Partial<Behaviour>) => {
    const previous = behaviour;
    setBehaviour({ ...behaviour, ...next });
    void track(updateSettings(next)).then((result) => {
      if (!toastResult(result).ok) setBehaviour(previous);
    });
  };

  return (
    <Card padding="none" className="flex flex-col px-7 pt-1.5 pb-2.5">
      <div className="flex flex-wrap items-center gap-5 py-4">
        <div className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
          <span id="creativity-label" className="text-field">
            Writing approach
          </span>
          <p id="creativity-description" className="text-meta text-muted">
            Faithful stays close to your wording. Balanced highlights relevant evidence. Optimized maximizes transferable capabilities for the job while preserving your history and metrics.
          </p>
        </div>
        <SegmentedControl
          aria-labelledby="creativity-label"
          aria-describedby="creativity-description"
          size="sm"
          options={CREATIVITY_OPTIONS}
          value={behaviour.creativity}
          onValueChange={(creativity) => change({ creativity })}
        />
      </div>
      <div className="flex flex-col gap-2 border-t border-line py-4">
        <Toggle
          label="Strict factual review"
          description={behaviour.creativity === "OPTIMIZED"
            ? "Optimized uses its own factual boundaries. This switch controls automatic factual review warnings; it does not restrict transferable skills."
            : "When enabled, Faithful and Balanced use stricter factual instructions and show automatic factual review warnings."}
          checked={behaviour.strict}
          onCheckedChange={(strict) => change({ strict })}
        />
        {!behaviour.strict && (
          <p role="status" className="rounded-control bg-warning-surface px-3 py-2 text-meta text-warning">
            Automatic factual review warnings are off. Review your draft before sending.
          </p>
        )}
      </div>
      <Toggle
        className="border-t border-line py-4"
        label="Show what changed"
        description="After each draft, list what was tailored compared with your base resume."
        checked={behaviour.showDiff}
        onCheckedChange={(showDiff) => change({ showDiff })}
      />
    </Card>
  );
}
