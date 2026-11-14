import { ScoringSection } from "../../(app)/settings/scoring-section";
import type { ScoringView } from "@/lib/scoring/scorers";
export function ScoringStep({ initial }: { initial: ScoringView }) { return <ScoringSection initial={initial} />; }
