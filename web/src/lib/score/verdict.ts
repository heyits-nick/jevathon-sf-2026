import { LOW_CONFIDENCE_THRESHOLD } from "./config";
import type { Dish } from "@/lib/api/types";

export type VerdictTone = "success" | "warning" | "danger";

export interface VerdictDisplay {
  label: string;
  tone: VerdictTone;
  uncertain: boolean;
}

/** Low-confidence verdicts are never shown as a plain yes/no. */
export function getVerdictDisplay({ verdict, confidence }: Pick<Dish, "verdict" | "confidence">): VerdictDisplay {
  const uncertain = verdict === "unclear" || confidence < LOW_CONFIDENCE_THRESHOLD;

  if (verdict === "unclear") return { label: "Unclear", tone: "warning", uncertain };
  if (verdict === "yes") {
    return uncertain
      ? { label: "Probably fits", tone: "warning", uncertain }
      : { label: "Fits", tone: "success", uncertain };
  }
  return uncertain
    ? { label: "Probably not", tone: "danger", uncertain }
    : { label: "Doesn't fit", tone: "danger", uncertain };
}

export const TONE_TEXT: Record<VerdictTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export const TONE_BG: Record<VerdictTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export const TONE_SOFT_BG: Record<VerdictTone, string> = {
  success: "bg-success/10",
  warning: "bg-warning/10",
  danger: "bg-destructive/10",
};

export function scoreTone(score: number): VerdictTone {
  if (score >= 0.6) return "success";
  if (score >= 0.3) return "warning";
  return "danger";
}
