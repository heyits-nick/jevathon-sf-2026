import { cn } from "@/lib/utils";
import { formatMs, formatUsd } from "@/lib/format";
import type { ScoreResponse } from "@/lib/api/types";

interface TimingStatsProps {
  result: ScoreResponse;
  roundTripMs?: number;
}

export function TimingStats({ result, roundTripMs }: TimingStatsProps) {
  const { dishes, timing_ms, jev_cost_usd } = result;
  const avgJevMs = dishes.length ? dishes.reduce((sum, d) => sum + d.jev_ms, 0) / dishes.length : undefined;

  const stats = [
    { label: "Jev per dish", value: avgJevMs === undefined ? undefined : formatMs(avgJevMs), highlight: true },
    { label: "Jev cost", value: jev_cost_usd == null ? undefined : formatUsd(jev_cost_usd), highlight: true },
    { label: "Menu fetch", value: formatMs(timing_ms.fetch) },
    { label: "Round trip", value: roundTripMs === undefined ? undefined : formatMs(roundTripMs) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{s.label}</dt>
          <dd className={cn("text-lg tabular-nums", s.highlight && "font-semibold", !s.value && "text-muted-foreground")}>
            {s.value ?? "Not reported"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
