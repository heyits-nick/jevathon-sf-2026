import { formatMs, formatPercent, formatTime } from "@/lib/format";
import type { DecisionTrace as Decision } from "@/lib/api/types";

/** Real Jev decision records from the server; renders nothing when none were recorded. */
export function DecisionTrace({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return null;

  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">How Jev decided ({decisions.length} decisions)</summary>
      <ol className="mt-3 divide-y">
        {decisions.map((d) => (
          <li key={d.id} className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr_auto] sm:items-baseline sm:gap-3">
            <span className="font-medium capitalize">{d.stage.replaceAll("_", " ")}</span>
            <span className="text-muted-foreground">
              {d.choice ?? "No single choice"}
              {d.confidence !== undefined && ` · ${formatPercent(d.confidence)} confidence`}
              {d.evidence_ids.length > 0 && ` · ${d.evidence_ids.length} sources`}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {d.model} · {formatMs(d.duration_ms)} · {formatTime(d.created_at)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
