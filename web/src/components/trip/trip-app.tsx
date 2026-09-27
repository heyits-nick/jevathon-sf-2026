"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrip } from "@/hooks/use-trip";
import type { Candidate } from "@/lib/api/types";
import { loadTripSession } from "@/lib/api/trip-session";
import { JevTrace } from "@/components/jev/jev-trace";
import { tripEvidence } from "@/lib/trip/evidence";
import { CandidateList } from "./candidate-list";
import { InlineError } from "./inline-error";
import { OperatorTools } from "./operator-tools";
import { TripHeader } from "./trip-header";
import { TripNotices } from "./trip-notices";
import { TripDashboard } from "./trip-dashboard";
import { TripPairing } from "./trip-pairing";
import { VoiceControl } from "./voice-control";

export function TripApp({ voiceSlot }: { voiceSlot?: React.ReactNode }) {
  const { trip, load, lastReply, pending, creating, createTrip, refresh, sendMessage, retryMessage, startOver } = useTrip();
  const selectedId = pending?.payload.selected_candidate_id;
  const selection = pending && selectedId ? { ...pending, candidateId: selectedId } : undefined;
  const messagePending = selection ? null : pending;
  const chooseCandidate = (candidate: Candidate) =>
    sendMessage({ text: `I'll go with ${candidate.restaurant}.`, selected_candidate_id: candidate.id });
  const session = trip ? loadTripSession() : null;
  const voiceBase = process.env.NEXT_PUBLIC_VOICE_BASE_URL ||
    (process.env.NODE_ENV === "development" ? "http://localhost:8788" : "");
  const activeVoice = trip && session?.tripId === trip.id && voiceBase ? (
    <VoiceControl tripId={trip.id} accessToken={session.token} voiceBase={voiceBase} onTrip={() => { void refresh(); }} />
  ) : null;

  if (load.status === "restoring" || (load.status === "loading" && !trip)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-72 rounded-2xl" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      </div>
    );
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
    return <TripPairing onCreate={createTrip} pending={creating !== null && !creating.error} error={creating?.error} />;
  }

  return (
    <TripDashboard
      header={
        <>
          <TripHeader trip={trip} refreshing={load.status === "loading"} onRefresh={refresh} onStartOver={startOver} />
          {load.status === "error" && <InlineError message={load.error} onRetry={refresh} />}
        </>
      }
      main={
        <>
          <TripNotices trip={trip} lastReply={lastReply} />
          <CandidateList
            trip={trip}
            selection={selection}
            busy={pending?.status === "sending"}
            onChoose={chooseCandidate}
            onRetry={retryMessage}
          />
        </>
      }
      rail={
        <>
          <JevTrace decisions={trip.decisions} evidence={tripEvidence(trip)} candidates={trip.candidates} />
          <OperatorTools
            trip={trip}
            pending={messagePending}
            onSend={sendMessage}
            onRetry={retryMessage}
            voiceSlot={voiceSlot ?? activeVoice}
          />
        </>
      }
    />
  );
}
