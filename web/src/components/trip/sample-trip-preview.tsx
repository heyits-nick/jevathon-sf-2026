"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SAMPLE_TRIP } from "@/lib/fixtures/trip";
import { CandidateList } from "./candidate-list";
import { DecisionTrace } from "./decision-trace";
import { SavedPosts } from "./saved-posts";
import { TripHeader } from "./trip-header";

const noop = () => {};

/** Development-only render of trip components with fixture data; actions are inert. */
export function SampleTripPreview() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <TripHeader trip={SAMPLE_TRIP} refreshing={false} onRefresh={noop} onStartOver={noop} />
          <DecisionTrace decisions={SAMPLE_TRIP.decisions} />
          <SavedPosts saves={SAMPLE_TRIP.saves} />
        </CardContent>
      </Card>
      <CandidateList trip={SAMPLE_TRIP} busy={false} onChoose={noop} onRetry={noop} />
    </div>
  );
}
