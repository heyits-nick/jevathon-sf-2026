import { SearchCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dietLabel } from "@/lib/score/config";
import { getVerdictDisplay, scoreTone, TONE_TEXT } from "@/lib/score/verdict";
import { formatPercent } from "@/lib/format";
import type { ScoreResponse } from "@/lib/api/types";

export function RestaurantSummary({ result }: { result: ScoreResponse }) {
  const counts = countDishes(result);

  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{dietLabel(result.diet)}</Badge>
          {result.escalated && (
            <Badge variant="outline">
              <SearchCheckIcon data-icon="inline-start" />
              Escalated to reviews
            </Badge>
          )}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{result.restaurant}</h2>
        <p className="text-sm text-muted-foreground">
          <Count value={counts.fits} label="fit" tone="text-success" /> ·{" "}
          <Count value={counts.uncertain} label="uncertain" tone="text-warning" /> ·{" "}
          <Count value={counts.noFit} label="don't fit" tone="text-destructive" />
        </p>
      </div>
      <div className="text-right">
        <div className={cn("text-5xl font-semibold tabular-nums tracking-tight", TONE_TEXT[scoreTone(result.score)])}>
          {formatPercent(result.score)}
        </div>
        <div className="text-sm text-muted-foreground">of dishes marked yes</div>
        <div className="text-xs text-muted-foreground">Menu coverage, not a safety guarantee</div>
      </div>
    </div>
  );
}

function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span>
      <span className={cn("font-medium tabular-nums", tone)}>{value}</span> {label}
    </span>
  );
}

function countDishes({ dishes }: ScoreResponse) {
  return dishes.reduce(
    (acc, dish) => {
      const { uncertain } = getVerdictDisplay(dish);
      if (uncertain) acc.uncertain++;
      else if (dish.verdict === "yes") acc.fits++;
      else acc.noFit++;
      return acc;
    },
    { fits: 0, uncertain: 0, noFit: 0 },
  );
}
