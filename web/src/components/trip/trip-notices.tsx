import { CircleAlertIcon, CircleHelpIcon, Loader2Icon, MessageSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trip } from "@/lib/api/types";

interface TripNoticesProps {
  trip: Trip;
  lastReply: string | null;
}

const TONES = {
  neutral: { card: "border-border bg-card", tile: "bg-muted text-foreground", kicker: "text-muted-foreground" },
  progress: { card: "border-border bg-card", tile: "bg-brand/20 text-warning", kicker: "text-warning" },
  input: { card: "border-warning/40 bg-warning/5", tile: "bg-warning/15 text-warning", kicker: "text-warning" },
  error: { card: "border-destructive/30 bg-destructive/5", tile: "bg-destructive/10 text-destructive", kicker: "text-destructive" },
};

interface NoticeProps {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  kicker: string;
  role: "alert" | "status";
  children: React.ReactNode;
}

function Notice({ tone, icon, kicker, role, children }: NoticeProps) {
  const t = TONES[tone];
  return (
    <div role={role} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-2xl border p-5", t.card)}>
      <span className={cn("flex size-11 items-center justify-center rounded-xl [&_svg]:size-5", t.tile)}>{icon}</span>
      <div className="space-y-1.5">
        <p className={cn("text-xs font-semibold tracking-[0.1em] uppercase", t.kicker)}>{kicker}</p>
        {children}
      </div>
    </div>
  );
}

/** Status-specific guidance plus the server's latest reply when it isn't already in the conversation. */
export function TripNotices({ trip, lastReply }: TripNoticesProps) {
  const replyShown = lastReply && trip.messages.some((m) => m.role === "assistant" && m.text === lastReply);

  return (
    <div className="space-y-3 empty:hidden">
      {trip.status === "needs_clarification" && trip.clarification && (
        <Notice tone="input" role="alert" icon={<CircleHelpIcon />} kicker="We need a bit more info">
          <p className="font-display text-xl leading-snug font-bold text-pretty">{trip.clarification}</p>
          <p className="text-sm text-muted-foreground">Answer in the conversation panel.</p>
        </Notice>
      )}
      {trip.status === "researching" && (
        <Notice tone="progress" role="status" icon={<Loader2Icon className="animate-spin" />} kicker="Researching">
          <p className="font-display text-xl font-bold">Reading menus and checking dishes</p>
          <p className="text-sm text-muted-foreground">This page updates on its own; you can also refresh.</p>
        </Notice>
      )}
      {trip.status === "failed" && (
        <Notice tone="error" role="alert" icon={<CircleAlertIcon />} kicker="Research didn’t finish">
          <p className="text-[0.95rem] text-pretty">Your saved posts are kept. Send a message to try again or add another place.</p>
        </Notice>
      )}
      {lastReply && !replyShown && (
        <Notice tone="neutral" role="status" icon={<MessageSquareIcon />} kicker="Latest reply">
          <p className="text-[0.95rem] text-pretty">{lastReply}</p>
        </Notice>
      )}
    </div>
  );
}
