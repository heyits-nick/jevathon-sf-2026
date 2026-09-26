import { CircleAlertIcon, CircleHelpIcon, Loader2Icon, MessageSquareIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Trip } from "@/lib/api/types";

interface TripNoticesProps {
  trip: Trip;
  lastReply: string | null;
}

/** Status-specific guidance plus the server's latest reply when it isn't already in the conversation. */
export function TripNotices({ trip, lastReply }: TripNoticesProps) {
  const replyShown = lastReply && trip.messages.some((m) => m.role === "assistant" && m.text === lastReply);

  return (
    <div className="space-y-3">
      {trip.status === "needs_clarification" && trip.clarification && (
        <Alert className="border-warning/40">
          <CircleHelpIcon />
          <AlertTitle>We need a bit more info</AlertTitle>
          <AlertDescription>{trip.clarification}</AlertDescription>
        </Alert>
      )}
      {trip.status === "researching" && (
        <Alert>
          <Loader2Icon className="animate-spin" />
          <AlertTitle>Researching menus</AlertTitle>
          <AlertDescription>Reading menus and checking dishes. This page updates on its own; you can also refresh.</AlertDescription>
        </Alert>
      )}
      {trip.status === "failed" && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Research didn&rsquo;t finish</AlertTitle>
          <AlertDescription>Your saved posts are kept. Send a message to try again or add another place.</AlertDescription>
        </Alert>
      )}
      {lastReply && !replyShown && (
        <Alert>
          <MessageSquareIcon />
          <AlertDescription>{lastReply}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
