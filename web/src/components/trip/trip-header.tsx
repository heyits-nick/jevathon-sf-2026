import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dietLabel } from "@/lib/score/config";
import type { Trip } from "@/lib/api/types";
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <TripStatusBadge status={trip.status} />
          <h2 className="text-2xl font-semibold tracking-tight">{trip.destination ?? "Trip without a destination yet"}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            New trip
          </Button>
        </div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        {preferences.map((p) => (
          <div key={p.label} className="rounded-lg border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{p.label}</dt>
            <dd className={p.value ? "" : "text-muted-foreground"}>{p.value || "Not set"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Preferences change when the traveler texts them, or from Presenter tools below.
      </p>
    </div>
  );
}
