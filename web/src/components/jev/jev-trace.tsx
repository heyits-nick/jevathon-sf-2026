"use client";

import { MotionConfig } from "motion/react";
import { formatMs, formatUsd } from "@/lib/format";
import { confidenceTone, stageCopy } from "@/lib/jev/stages";
import { resolveChoiceLabel } from "@/lib/trip/evidence";
import type { Candidate, DecisionTrace as Decision, Evidence } from "@/lib/api/types";
import { JevTicket } from "./jev-ticket";

interface JevTraceProps {
  decisions: Decision[];
  evidence?: Evidence[];
  candidates?: Candidate[];
  costUsd?: number;
  /** Open by default so the demo can show the rail without a click. */
  defaultOpen?: boolean;
}

export function JevTrace({
  decisions,
  evidence = [],
  candidates = [],
  costUsd,
  defaultOpen = true,
}: JevTraceProps) {
  const fonts = "jev-trace";

  if (decisions.length === 0) {
    return (
      <section className={fonts}>
        <div className="jev-trace-shell">
          <div className="jev-trace-summary">
            <span className="jev-trace-kicker">Behind the scenes</span>
            <span className="jev-trace-title">Waiting on Jev</span>
            <span className="jev-trace-count">0 typed calls</span>
          </div>
          <div className="jev-trace-body">
            <p className="jev-trace-lede">
              No decisions have been recorded yet. Tickets appear here as the backend logs real Jev
              calls. Steps that never ran will stay blank.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const ordered = [...decisions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const models = [...new Set(ordered.map((d) => d.model))];
  const totalMs = ordered.reduce((sum, d) => sum + d.duration_ms, 0);
  const byId = new Map(evidence.map((e) => [e.id, e]));

  return (
    <MotionConfig reducedMotion="user">
    <section className={fonts}>
      <details className="jev-trace-shell" open={defaultOpen}>
        <summary className="jev-trace-summary">
          <span className="jev-trace-kicker">Behind the scenes</span>
          <span className="jev-trace-title">How Jev decided</span>
          <span className="jev-trace-count">{ordered.length} typed calls</span>
        </summary>

        <div className="jev-trace-body">
          <p className="jev-trace-lede">
            Each ticket is a real Jev call. Steps that never ran are not invented. A quote is context, not
            proof an ingredient is missing.
          </p>

          <dl className="jev-trace-stats">
            <Stat label="Calls" value={String(ordered.length)} />
            <Stat label="Jev time" value={formatMs(totalMs)} />
            <Stat label="Cost" value={costUsd == null ? "Not reported" : formatUsd(costUsd)} />
            <Stat label="Model" value={models[0] ?? "Not reported"} />
          </dl>

          <ol className="jev-trace-rail">
            {ordered.map((decision, index) => (
              <JevTicket
                key={decision.id}
                index={index + 1}
                label={stageCopy(decision.stage).label}
                question={stageCopy(decision.stage).question}
                choice={resolveChoiceLabel(decision.choice, candidates)}
                confidence={decision.confidence}
                tone={confidenceTone(decision.confidence)}
                durationMs={decision.duration_ms}
                model={decision.model}
                probabilities={decision.probabilities}
                evidence={decision.evidence_ids.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e))}
                missingEvidence={decision.evidence_ids.length > 0 && decision.evidence_ids.every((id) => !byId.has(id))}
                candidates={candidates}
              />
            ))}
          </ol>
        </div>
      </details>
    </section>
    </MotionConfig>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
