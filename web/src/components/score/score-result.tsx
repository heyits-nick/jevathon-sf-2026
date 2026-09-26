import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ScoreResponse } from "@/lib/api/types";
import { ConfidenceMeter } from "./confidence-meter";
import { DishList } from "./dish-list";
import { EvidenceList } from "./evidence-list";
import { RestaurantSummary } from "./restaurant-summary";
import { TimingStats } from "./timing-stats";

interface ScoreResultProps {
  result: ScoreResponse;
  roundTripMs?: number;
  /** Changes per run so the confidence meter replays its animation. */
  runKey?: string | number;
}

export function ScoreResult({ result, roundTripMs, runKey }: ScoreResultProps) {
  return (
    <div className="space-y-6">
      <RestaurantSummary result={result} />
      {result.warnings?.map((warning) => (
        <Alert key={warning}>
          <TriangleAlertIcon />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}
      <ConfidenceMeter key={runKey} result={result} />
      <TimingStats result={result} roundTripMs={roundTripMs} />
      <DishList dishes={result.dishes} />
      <EvidenceList evidence={result.evidence ?? []} />
    </div>
  );
}
