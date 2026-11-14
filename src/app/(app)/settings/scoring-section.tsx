import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { ScoringView } from "@/lib/scoring/scorers";
export function ScoringSection(props: { initial: ScoringView }) {
  void props;
  return <Card><h2 className="mb-3 text-lg font-medium">Jev through OpenRouter</h2>
    <p className="mb-3 text-sm text-muted">Job fit and tailored resumes use Jev 1.14. Dossier calculates scores, reasons, and red flags from its judgments. It uses your shared OpenRouter key.</p>
    <Link href="/settings?section=ai" className="text-sm underline">Manage the OpenRouter connection</Link>
  </Card>;
}
