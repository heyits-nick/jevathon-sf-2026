import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dietLabel } from "@/lib/score/config";
import type { Trip } from "@/lib/api/types";
import { SavedPosts } from "./saved-posts";
import { TripStatusBadge } from "./trip-status";

interface TripHeaderProps {
  trip: Trip;
  refreshing: boolean;
  onRefresh: () => void;
  onStartOver: () => void;
}

export function TripHeader({ trip, refreshing, onRefresh, onStartOver }: TripHeaderProps) {
  const { diet, budget, notes } = trip.preferences;
  const preferences = [
    { label: "Diet", value: diet ? dietLabel(diet) : undefined },
    { label: "Budget", value: budget },
    { label: "Notes", value: notes },
  ];
  const researched = trip.candidates.length;

  return (
    <section className="space-y-6" aria-labelledby="trip-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TripStatusBadge status={trip.status} />
          {researched > 0 && (
            <span className="text-sm text-muted-foreground">
              {researched} {researched === 1 ? "menu" : "menus"} researched
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            Refresh
          </Button>
          <Button variant="ghost" onClick={onStartOver}>
            New trip
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h1 id="trip-heading" className="font-display text-5xl leading-none font-extrabold tracking-tighter text-balance sm:text-6xl">
          {trip.destination ?? "Trip without a destination yet"}
        </h1>
        <dl className="flex flex-wrap gap-2 text-sm">
          {preferences.map((p) => (
            <div key={p.label} className="flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2">
              <dt className="text-muted-foreground">{p.label}</dt>
              <dd className={cn("font-semibold", !p.value && "font-normal text-muted-foreground")}>{p.value || "Not set"}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">Preferences change when the traveler texts them, or from the conversation panel.</p>
      </div>

      <SavedPosts saves={trip.saves} />
    </section>
  );
}
