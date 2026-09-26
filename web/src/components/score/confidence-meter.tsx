"use client";

import { useEffect, useState } from "react";
import { TrendingUpIcon } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/score/config";
import type { ScoreResponse } from "@/lib/api/types";
import { ConfidenceBar } from "./confidence-bar";

const RISE_DELAY_MS = 600;

/** Restaurant-level confidence; animates from the first pass to the escalated value. Remount per result. */
export function ConfidenceMeter({ result }: { result: ScoreResponse }) {
  const before = result.before_escalation?.confidence;
  const [shown, setShown] = useState(before ?? result.confidence);

  useEffect(() => {
    if (before === undefined) return;
    const id = setTimeout(() => setShown(result.confidence), RISE_DELAY_MS);
    return () => clearTimeout(id);
  }, [before, result.confidence]);

  const tone = shown >= LOW_CONFIDENCE_THRESHOLD ? "success" : "warning";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">How sure we are</span>
        {before !== undefined && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <TrendingUpIcon className="size-3.5" />
            {formatPercent(before)} → {formatPercent(result.confidence)} after checking reviews
          </span>
        )}
      </div>
      <ConfidenceBar value={shown} tone={tone} />
    </div>
  );
}
