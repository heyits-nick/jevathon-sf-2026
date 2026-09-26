import type { Trip } from "@/lib/api/types";
import { SAMPLE_SCORE } from "./score";

/** Layout fixture only. Rendered solely on the development sample route with a "no live call" label. */
export const SAMPLE_TRIP: Trip = {
  id: "sample-trip",
  destination: "New York",
  preferences: { diet: "vegan", budget: "Under $25" },
  status: "ready",
  saves: [
    {
      id: "s1",
      source_url: "https://example.com/post/1",
      place_name: "Sample Thai Kitchen",
      note: "Saw this on a food account",
      created_at: "2026-09-26T20:30:00Z",
    },
  ],
  candidates: [
    {
      id: "c1",
      restaurant: "Sample Thai Kitchen",
      menu_url: "https://example.com/menu",
      score_result: SAMPLE_SCORE,
      evidence: [],
      recommendation_reason: "Most dishes are marked vegan with high confidence, and it is the place you saved.",
      directions_url: "https://example.com/directions",
    },
    {
      id: "c2",
      restaurant: "Sample Noodle Bar",
      menu_url: "https://example.com/noodles",
      score_result: { ...SAMPLE_SCORE, restaurant: "Sample Noodle Bar", score: 0.1, confidence: 0.52, escalated: false, before_escalation: null, evidence: [] },
      evidence: [],
      recommendation_reason: null,
    },
  ],
  recommended_candidate_ids: ["c1"],
  selected_candidate_id: null,
  clarification: null,
  messages: [],
  decisions: [
    { id: "d1", stage: "intent", model: "jev-1.13.0", choice: "research", confidence: 0.91, evidence_ids: [], duration_ms: 140, created_at: "2026-09-26T20:31:00Z" },
    { id: "d2", stage: "recommendation", model: "jev-1.13.0", choice: "c1", confidence: 0.84, evidence_ids: ["e1"], duration_ms: 190, created_at: "2026-09-26T20:31:30Z" },
  ],
};
