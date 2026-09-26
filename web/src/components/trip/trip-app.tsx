"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrip } from "@/hooks/use-trip";
import type { Candidate } from "@/lib/api/types";
import { JevTrace } from "@/components/jev/jev-trace";
import { tripEvidence } from "@/lib/trip/evidence";
import { CandidateList } from "./candidate-list";
import { InlineError } from "./inline-error";
import { OperatorTools } from "./operator-tools";
import { TripHeader } from "./trip-header";
import { TripNotices } from "./trip-notices";
import { TripStartForm } from "./trip-start-form";

export function TripApp({ voiceSlot }: { voiceSlot?: React.ReactNode }) {
  const { trip, load, lastReply, pending, creating, createTrip, refresh, sendMessage, retryMessage, startOver } = useTrip();
  const selectedId = pending?.payload.selected_candidate_id;
  const selection = pending && selectedId ? { ...pending, candidateId: selectedId } : undefined;
  const messagePending = selection ? null : pending;
  const chooseCandidate = (candidate: Candidate) =>
    sendMessage({ text: `I'll go with ${candidate.restaurant}.`, selected_candidate_id: candidate.id });

  if (load.status === "restoring" || (load.status === "loading" && !trip)) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!trip) {
    if (load.status === "error") {
      return (
        <Card>
          <CardContent>
            <InlineError message={load.error} onRetry={refresh} />
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start a trip</CardTitle>
          <CardDescription>
            Create a trip to drive and inspect from this console. Fields are optional; you can send
            diet and destination as messages. iMessage conversations keep their own separate trip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TripStartForm onCreate={createTrip} pending={creating !== null && !creating.error} error={creating?.error} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <TripHeader trip={trip} refreshing={load.status === "loading"} onRefresh={refresh} onStartOver={startOver} />
      {load.status === "error" && <InlineError message={load.error} onRetry={refresh} />}
      <TripNotices trip={trip} lastReply={lastReply} />
      <JevTrace decisions={trip.decisions} evidence={tripEvidence(trip)} candidates={trip.candidates} />
      <CandidateList
        trip={trip}
        selection={selection}
        busy={pending?.status === "sending"}
        onChoose={chooseCandidate}
        onRetry={retryMessage}
      />
      <OperatorTools
        trip={trip}
        pending={messagePending}
        onSend={sendMessage}
        onRetry={retryMessage}
        voiceSlot={voiceSlot}
      />
    </div>
  );
}
