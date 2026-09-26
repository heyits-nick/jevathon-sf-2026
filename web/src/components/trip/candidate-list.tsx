"use client";

import { groupCandidates } from "@/lib/trip/candidates";
import type { Candidate, Trip } from "@/lib/api/types";
import { CandidateCard, type SelectionState } from "./candidate-card";

interface CandidateListProps {
  trip: Trip;
  /** Candidate ID with an in-flight or failed selection. */
  selection?: SelectionState & { candidateId: string };
  busy: boolean;
  onChoose: (candidate: Candidate) => void;
  onRetry: () => void;
}

export function CandidateList({ trip, selection, busy, onChoose, onRetry }: CandidateListProps) {
  const { recommended, others } = groupCandidates(trip);

  if (trip.candidates.length === 0) {
    return trip.status === "ready" ? (
      <p className="text-sm text-muted-foreground">Research finished without any candidate restaurants.</p>
    ) : null;
  }

  const card = (candidate: Candidate, rank?: number) => (
    <CandidateCard
      key={candidate.id}
      candidate={candidate}
      rank={rank}
      selected={trip.selected_candidate_id === candidate.id}
      selection={selection?.candidateId === candidate.id ? selection : undefined}
      selectionLocked={busy}
      onChoose={onChoose}
      onRetry={onRetry}
      collapsed={rank === undefined}
    />
  );

  return (
    <div className="space-y-6">
      {recommended.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Recommended</h2>
          {recommended.map((c, i) => card(c, i + 1))}
        </section>
      )}
      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Other places researched</h2>
          {others.map((c) => card(c))}
        </section>
      )}
    </div>
  );
}
