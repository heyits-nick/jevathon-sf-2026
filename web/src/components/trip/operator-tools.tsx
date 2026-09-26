"use client";

import type { UseTrip } from "@/hooks/use-trip";
import type { Trip } from "@/lib/api/types";
import { Conversation } from "./conversation";
import { SavedPosts } from "./saved-posts";
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
    <details className="rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Presenter tools
        <span className="ml-2 font-normal text-muted-foreground">Drive this trip from the browser</span>
      </summary>
      <div className="space-y-6 border-t px-4 py-4">
        <SavedPosts saves={trip.saves} />
        <Conversation messages={trip.messages} />
        <TripComposer
          pending={pending}
          onSend={onSend}
          onRetry={onRetry}
          clarification={trip.status === "needs_clarification" ? trip.clarification : null}
          voiceSlot={voiceSlot}
        />
      </div>
    </details>
  );
}
