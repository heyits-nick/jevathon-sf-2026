"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useScore, type ScoreState } from "@/hooks/use-score";
import { ResultsView } from "./results-view";
import { ScoreForm } from "./score-form";

export function ScoreApp({ initialState }: { initialState?: ScoreState }) {
  const { state, submit } = useScore(initialState);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <ScoreForm onSubmit={submit} loading={state.status === "loading"} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <ResultsView state={state} />
        </CardContent>
      </Card>
    </div>
  );
}
