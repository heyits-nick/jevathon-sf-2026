import { cn } from "@/lib/utils";
import { dietLabel } from "@/lib/score/config";
import { formatPercent } from "@/lib/format";
import { scoreTone, TONE_TEXT } from "@/lib/score/verdict";
import type { ScoreResponse } from "@/lib/api/types";
import { countDishes } from "./restaurant-summary";

const SEGMENTS = [
  { key: "fits", label: "fit", className: "bg-success" },
  { key: "uncertain", label: "uncertain", className: "bg-brand" },
  { key: "noFit", label: "don’t fit", className: "bg-muted-foreground/30" },
] as const;

/** Share of dishes per display verdict; low-confidence verdicts count as uncertain. */
export function VerdictBar({ result, className }: { result: ScoreResponse; className?: string }) {
  const counts = countDishes(result);
  const total = result.dishes.length;
  const summary = SEGMENTS.map((s) => `${counts[s.key]} ${s.label}`).join(", ");

  return (
    <div className={cn("space-y-2.5", className)}>
      <div role="img" aria-label={`${summary} of ${total} dishes`} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          SEGMENTS.map((s) =>
            counts[s.key] > 0 ? (
              <span key={s.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.className)} style={{ width: `${(counts[s.key] / total) * 100}%` }} />
            ) : null,
          )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.8rem] text-muted-foreground">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-[3px]", s.className)} />
            <span className="font-semibold text-foreground tabular-nums">{counts[s.key]}</span> {s.label}
          </span>
        ))}
        <span className="ml-auto">Checked for {dietLabel(result.diet).toLowerCase()}</span>
      </div>
    </div>
  );
}

/** Headline share of dishes marked yes with the coverage caveat. */
export function ScoreFigure({ result, size = "lg" }: { result: ScoreResponse; size?: "lg" | "sm" }) {
  return (
    <div className={cn("flex flex-col", size === "lg" ? "items-start sm:items-end" : "items-end")}>
      <span
        className={cn(
          "font-display leading-none font-extrabold tracking-tighter tabular-nums",
          size === "lg" ? "text-6xl sm:text-7xl" : "text-3xl",
          TONE_TEXT[scoreTone(result.score)],
        )}
      >
        {formatPercent(result.score)}
      </span>
      <span className={cn("text-muted-foreground", size === "lg" ? "mt-2 text-sm" : "text-xs")}>of dishes marked yes</span>
      <span className="text-xs text-muted-foreground">Menu coverage, not a safety guarantee</span>
    </div>
  );
}
