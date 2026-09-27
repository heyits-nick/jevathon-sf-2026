"use client";

import type { UseTrip } from "@/hooks/use-trip";
import type { Trip } from "@/lib/api/types";
import { Conversation } from "./conversation";
import { TripComposer } from "./trip-composer";

interface OperatorToolsProps {
  trip: Trip;
  pending: UseTrip["pending"];
  onSend: UseTrip["sendMessage"];
  onRetry: UseTrip["retryMessage"];
  voiceSlot?: React.ReactNode;
}

/** Presenter controls for driving this trip from the browser. */
export function OperatorTools({ trip, pending, onSend, onRetry, voiceSlot }: OperatorToolsProps) {
  return (
    <section aria-labelledby="conversation-heading" className="space-y-5 rounded-3xl border bg-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="conversation-heading" className="font-display text-xl font-bold tracking-tight">
          Conversation
        </h2>
        <span className="text-xs text-muted-foreground">iMessage · web · voice</span>
      </div>
      <Conversation messages={trip.messages} />
      <div className="border-t pt-5">
        <TripComposer
          pending={pending}
          onSend={onSend}
          onRetry={onRetry}
          clarification={trip.status === "needs_clarification" ? trip.clarification : null}
          voiceSlot={voiceSlot}
        />
      </div>
    </section>
  );
}
