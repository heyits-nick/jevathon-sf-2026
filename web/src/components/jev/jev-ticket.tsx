"use client";

import { motion, useReducedMotion } from "motion/react";
import { formatMs, formatPercent } from "@/lib/format";
import { EVIDENCE_KIND_LABEL } from "@/lib/score/config";
import { resolveOptionLabel } from "@/lib/trip/evidence";
import type { Candidate, Evidence } from "@/lib/api/types";

type Tone = "success" | "warning" | "danger" | "muted";

interface JevTicketProps {
  index: number;
  label: string;
  question: string;
  choice: string;
  confidence?: number;
  tone: Tone;
  durationMs: number;
  model: string;
  probabilities?: Record<string, number>;
  evidence: Evidence[];
  missingEvidence: boolean;
  candidates: Candidate[];
}

const ease = [0.16, 1, 0.3, 1] as const;

export function JevTicket({
  index,
  label,
  question,
  choice,
  confidence,
  tone,
  durationMs,
  model,
  probabilities,
  evidence,
  missingEvidence,
  candidates,
}: JevTicketProps) {
  const reduce = useReducedMotion();
  const alts = Object.entries(probabilities ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const delay = reduce ? 0 : (index - 1) * 0.08;

  return (
    <motion.li
      className="jev-ticket"
      data-tone={tone}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.16 : 0.48, delay, ease }}
    >
      <div className="jev-ticket-index" aria-hidden>
        {String(index).padStart(2, "0")}
      </div>
      <div className="jev-ticket-main">
        <div className="jev-ticket-meta">
          <span className="jev-ticket-stage">{label}</span>
          <span className="jev-ticket-time">
            {formatMs(durationMs)} · {model}
          </span>
        </div>
        <p className="jev-ticket-question">{question}</p>
        <p className="jev-ticket-choice">{choice}</p>

        <motion.div
          className="jev-ticket-stamp"
          data-tone={tone}
          initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -10, scale: 0.86 }}
          animate={{ opacity: 1, rotate: -3, scale: 1 }}
          transition={{ duration: reduce ? 0.16 : 0.42, delay: delay + 0.12, ease }}
        >
          <span>{confidence === undefined ? "Not reported" : formatPercent(confidence)}</span>
          <span>confidence</span>
        </motion.div>

        {alts.length > 1 && (
          <ul className="jev-alts" aria-label="Other options Jev considered">
            {alts.map(([name, value]) => (
              <li key={name}>
                <span>{resolveOptionLabel(name, candidates)}</span>
                <span className="jev-alt-track">
                  <motion.span
                    className="jev-alt-fill"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: reduce ? 0.01 : 0.55, delay: delay + 0.18, ease }}
                    style={{ width: `${Math.round(value * 100)}%` }}
                  />
                </span>
                <span className="jev-alt-n">{formatPercent(value)}</span>
              </li>
            ))}
          </ul>
        )}

        {evidence.length > 0 && (
          <ul className="jev-quotes">
            {evidence.map((e) => (
              <li key={e.id}>
                <span className="jev-quote-kind">{EVIDENCE_KIND_LABEL[e.kind] ?? e.kind}</span>
                <blockquote>&ldquo;{e.quote}&rdquo;</blockquote>
              </li>
            ))}
          </ul>
        )}
        {missingEvidence && <p className="jev-missing">Sources were referenced but not returned with this trip.</p>}
      </div>
    </motion.li>
  );
}
