"use client";

import { SAMPLE_TRIP } from "@/lib/fixtures/trip";
import { JevTrace } from "@/components/jev/jev-trace";
import { tripEvidence } from "@/lib/trip/evidence";
import { CandidateList } from "./candidate-list";
import { OperatorTools } from "./operator-tools";
import { TripDashboard } from "./trip-dashboard";
import { TripHeader } from "./trip-header";

const noopAsync = async () => false;

/** Development-only render of the console with fixture data; actions are inert. */
export function SampleTripPreview() {
  return (
    <TripDashboard
      header={<TripHeader trip={SAMPLE_TRIP} refreshing={false} onRefresh={() => {}} onStartOver={() => {}} />}
      main={<CandidateList trip={SAMPLE_TRIP} busy={false} onChoose={() => {}} onRetry={noopAsync} />}
      rail={
        <>
          <JevTrace
            decisions={SAMPLE_TRIP.decisions}
            evidence={tripEvidence(SAMPLE_TRIP)}
            candidates={SAMPLE_TRIP.candidates}
            costUsd={SAMPLE_TRIP.candidates[0]?.score_result.jev_cost_usd}
          />
          <OperatorTools trip={SAMPLE_TRIP} pending={null} onSend={noopAsync} onRetry={noopAsync} />
        </>
      }
    />
  );
}
