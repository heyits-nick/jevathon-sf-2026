import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/score/config";

export interface StageCopy {
  label: string;
  question: string;
}

const STAGES: Record<string, StageCopy> = {
  intent: { label: "Intent", question: "What is this person asking us to do?" },
  place: { label: "Place", question: "Which saved place are they talking about?" },
  preferences: { label: "Preferences", question: "What diet and constraints apply?" },
  next_action: { label: "Next action", question: "What should happen next?" },
  dietary: { label: "Diet judgment", question: "Does this dish fit the diet?" },
  dish: { label: "Diet judgment", question: "Does this dish fit the diet?" },
  dish_suitability: { label: "Diet judgment", question: "Does this dish fit the diet?" },
  escalation: { label: "Escalation", question: "Would more evidence resolve the uncertainty?" },
  recommendation: { label: "Recommendation", question: "Which eligible place should we suggest?" },
  recall: { label: "Recall", question: "Which saved place answers this?" },
  response: { label: "Reply", question: "Answer, clarify, or offer a next step?" },
};

export function stageCopy(stage: string): StageCopy {
  return (
    STAGES[stage] ?? {
      label: stage.replaceAll("_", " "),
      question: `Jev decided this ${stage.replaceAll("_", " ")} step.`,
    }
  );
}

export function confidenceTone(confidence: number | undefined): "success" | "warning" | "danger" | "muted" {
  if (confidence === undefined) return "muted";
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return "success";
  if (confidence >= 0.5) return "warning";
  return "danger";
}
