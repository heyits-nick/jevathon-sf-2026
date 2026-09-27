import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Evidence, ScoreResponse } from "@/lib/api/types";
import { ConfidenceMeter } from "./confidence-meter";
import { DishList } from "./dish-list";
import { EvidenceList } from "./evidence-list";
import { RestaurantSummary } from "./restaurant-summary";
import { JevTrace } from "@/components/jev/jev-trace";
import { TimingStats } from "./timing-stats";

interface ScoreResultProps {
  result: ScoreResponse;
  roundTripMs?: number;
  /** Changes per run so the confidence meter replays its animation. */
  runKey?: string | number;
  /** Overrides `result.evidence`, e.g. with a trip candidate's merged evidence. */
  evidence?: Evidence[];
  /** Hide when the surrounding card already titles the restaurant. */
  showRestaurantName?: boolean;
  /** Trip cards already show the trip-level rail; keep this for the standalone score page. */
  showTrace?: boolean;
  /** Hide the headline summary when the surrounding card already shows the score and counts. */
  showSummary?: boolean;
}

export function ScoreResult({
  result,
  roundTripMs,
  runKey,
  evidence = result.evidence ?? [],
  showRestaurantName = true,
  showTrace = true,
  showSummary = true,
}: ScoreResultProps) {
  return (
    <div className="space-y-6">
      {showSummary && <RestaurantSummary result={result} showName={showRestaurantName} />}
      <ScoreWarnings warnings={result.warnings} />
      <ConfidenceMeter key={runKey} result={result} />
      <TimingStats result={result} roundTripMs={roundTripMs} />
      {showTrace && <JevTrace decisions={result.decisions ?? []} evidence={evidence} costUsd={result.jev_cost_usd} />}
      <DishList dishes={result.dishes} />
      <EvidenceList evidence={evidence} />
    </div>
  );
}

export function ScoreWarnings({ warnings }: { warnings?: string[] }) {
  return warnings?.map((warning) => (
    <Alert key={warning}>
      <TriangleAlertIcon />
      <AlertDescription>{warning}</AlertDescription>
    </Alert>
  ));
}
