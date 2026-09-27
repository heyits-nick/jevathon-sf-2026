"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CreateTripRequest } from "@/lib/api/types";
import { TripResumeForm } from "./trip-resume-form";
import { TripStartForm } from "./trip-start-form";

const STEPS = [
  { title: "Share a post", body: "Text or paste a public link to a place you saved." },
  { title: "Jev checks menus", body: "Place, sources and dishes, each a typed Jev call." },
  { title: "Pick with evidence", body: "Quotes and confidence. Uncertainty stays visible." },
];

interface TripPairingProps {
  onCreate: (req: CreateTripRequest) => void;
  pending: boolean;
  error?: string;
}

export function TripPairing({ onCreate, pending, error }: TripPairingProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16 lg:pt-6">
      <section className="space-y-7">
        <p className="text-xs font-semibold tracking-[0.16em] text-warning uppercase">Saved post in · checked menus out</p>
        <h1 className="max-w-2xl font-display text-5xl leading-[0.98] font-extrabold tracking-tighter text-balance sm:text-6xl">
          Turn a saved post into a place you can actually eat.
        </h1>
        <p className="max-w-xl text-pretty text-muted-foreground sm:text-lg">
          Inspect a stored trip: the evidence Jev used and every typed decision it recorded. iMessage and voice reach the
          same backend; iMessage conversations keep their own trip.
        </p>
        <ol className="grid max-w-2xl gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="space-y-1.5 rounded-2xl border bg-card p-4">
              <span className="font-mono text-xs text-warning">{String(i + 1).padStart(2, "0")}</span>
              <p className="font-semibold">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="pair-heading"
        className="space-y-5 rounded-3xl border bg-card p-6 shadow-[0_24px_48px_-28px_oklch(0.21_0.006_85/35%)] sm:p-8"
      >
        <div className="space-y-1">
          <h2 id="pair-heading" className="font-display text-2xl font-extrabold tracking-tight">
            Pair a trip
          </h2>
          <p className="text-sm text-muted-foreground">Create a trip, or open an existing iMessage trip with its access token.</p>
        </div>
        <div className="grid grid-cols-2 rounded-xl bg-muted p-1" role="group" aria-label="Pairing mode">
          {(
            [
              ["new", "New trip"],
              ["existing", "Open existing"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "h-10 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                mode === value ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "new" ? <TripStartForm onCreate={onCreate} pending={pending} error={error} /> : <TripResumeForm />}
      </section>
    </div>
  );
}
