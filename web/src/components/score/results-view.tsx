import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ScoreState } from "@/hooks/use-score";
import { ResultsLoading } from "./results-loading";
import { ScoreResult } from "./score-result";

export function ResultsView({ state }: { state: ScoreState }) {
  switch (state.status) {
    case "idle":
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Enter a restaurant and its menu URL to see which dishes fit your diet.
        </p>
      );
    case "loading":
      return <ResultsLoading restaurant={state.request.restaurant} />;
    case "error":
      return (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Couldn&rsquo;t score {state.request.restaurant}</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      );
    case "success":
      return <ScoreResult result={state.result} roundTripMs={state.roundTripMs} runKey={state.runId} />;
  }
}
