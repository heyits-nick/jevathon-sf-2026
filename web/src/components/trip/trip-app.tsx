"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrip } from "@/hooks/use-trip";
import { Conversation } from "./conversation";
import { InlineError } from "./inline-error";
import { SavedPosts } from "./saved-posts";
import { TripComposer } from "./trip-composer";
import { TripHeader } from "./trip-header";
import { TripNotices } from "./trip-notices";
import { TripStartForm } from "./trip-start-form";

export function TripApp({ voiceSlot }: { voiceSlot?: React.ReactNode }) {
  const { trip, load, lastReply, pending, creating, createTrip, refresh, sendMessage, retryMessage, startOver } = useTrip();

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
          <CardDescription>Everything is optional. You can add details later by message.</CardDescription>
        </CardHeader>
        <CardContent>
          <TripStartForm onCreate={createTrip} pending={creating !== null && !creating.error} error={creating?.error} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <TripHeader trip={trip} refreshing={load.status === "loading"} onRefresh={refresh} onStartOver={startOver} />
          {load.status === "error" && <InlineError message={load.error} onRetry={refresh} />}
          <TripNotices trip={trip} lastReply={lastReply} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-6">
          <SavedPosts saves={trip.saves} />
          <Conversation messages={trip.messages} />
          <TripComposer
            pending={pending}
            onSend={sendMessage}
            onRetry={retryMessage}
            clarification={trip.status === "needs_clarification" ? trip.clarification : null}
            voiceSlot={voiceSlot}
          />
        </CardContent>
      </Card>
    </div>
  );
}
