import type { ScoreResponse } from "@/lib/api/types";

/** Layout fixture only. Rendered solely on the development sample route with a "no live call" label. */
export const SAMPLE_SCORE: ScoreResponse = {
  restaurant: "Sample Thai Kitchen",
  diet: "vegan",
  score: 0.33,
  confidence: 0.73,
  escalated: true,
  before_escalation: { score: 0.33, confidence: 0.58 },
  dishes: [
    { id: "d1", name: "Tofu green curry", verdict: "yes", confidence: 0.94, source: "menu", jev_ms: 180, evidence_ids: ["e1"] },
    { id: "d2", name: "Garden spring rolls", verdict: "yes", confidence: 0.88, source: "menu", jev_ms: 165 },
    { id: "d3", name: "Pad thai", verdict: "unclear", confidence: 0.41, source: "menu+reviews", jev_ms: 210, evidence_ids: ["e2"] },
    { id: "d4", name: "Tom yum soup", verdict: "yes", confidence: 0.62, source: "menu+reviews", jev_ms: 195 },
    { id: "d5", name: "Chicken satay", verdict: "no", confidence: 0.99, source: "menu", jev_ms: 150 },
    { id: "d6", name: "Mango sticky rice", verdict: "unclear", confidence: 0.55, source: "menu+reviews", jev_ms: 205 },
  ],
  timing_ms: { fetch: 4200, jev_total: 1105 },
  jev_cost_usd: 0.00012,
  decisions: [
    {
      id: "sd1",
      stage: "dietary",
      model: "jev-1.13.0",
      choice: "yes",
      confidence: 0.94,
      probabilities: { yes: 0.94, no: 0.04, unclear: 0.02 },
      evidence_ids: ["e1"],
      duration_ms: 180,
      created_at: "2026-09-26T20:40:01Z",
    },
    {
      id: "sd2",
      stage: "escalation",
      model: "jev-1.13.0",
      choice: "seek_evidence",
      confidence: 0.61,
      probabilities: { seek_evidence: 0.61, stop: 0.39 },
      evidence_ids: ["e2"],
      duration_ms: 150,
      created_at: "2026-09-26T20:40:04Z",
    },
  ],
  evidence: [
    {
      id: "e1",
      url: "https://example.com/menu",
      quote: "Green curry with tofu, coconut milk, Thai basil. Vegan on request.",
      kind: "menu",
      checked_at: "2026-09-26T20:40:00Z",
    },
    {
      id: "e2",
      url: "https://example.com/reviews",
      quote: "They told me the pad thai sauce has fish sauce but they can leave it out.",
      kind: "review",
      checked_at: "2026-09-26T20:40:05Z",
    },
  ],
};
