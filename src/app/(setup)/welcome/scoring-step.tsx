import Link from "next/link";
import { Card } from "@/components/ui/card";

export function ScoringStep() {
  return (
    <Card>
      <p className="mb-3 text-sm text-muted">Scoring uses the shared OpenRouter key from AI settings.</p>
      <Link href="/settings?section=ai" className="text-sm underline">Manage the OpenRouter connection</Link>
    </Card>
  );
}
