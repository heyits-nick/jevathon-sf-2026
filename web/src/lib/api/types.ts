/** Mirrors the shared contract in docs/architecture.md. */

export type Verdict = "yes" | "no" | "unclear";

export type EvidenceKind = "menu" | "review" | "diet_site";

export interface Evidence {
  id: string;
  url: string;
  quote: string;
  kind: EvidenceKind;
  checked_at: string;
}

export interface DecisionTrace {
  id: string;
  stage: string;
  model: string;
  choice?: string;
  confidence?: number;
  evidence_ids: string[];
  duration_ms: number;
  created_at: string;
}

export interface ScoreRequest {
  restaurant: string;
  menu_url: string;
  diet: string;
}

export interface Dish {
  id?: string;
  name: string;
  verdict: Verdict;
  confidence: number;
  source: string;
  jev_ms: number;
  evidence_ids?: string[];
}

export interface ScoreSnapshot {
  score: number;
  confidence: number;
}

export interface ScoreResponse extends ScoreSnapshot {
  restaurant: string;
  diet: string;
  escalated: boolean;
  before_escalation: ScoreSnapshot | null;
  dishes: Dish[];
  timing_ms: { fetch: number; jev_total: number };
  jev_cost_usd?: number;
  evidence?: Evidence[];
  decisions?: DecisionTrace[];
  warnings?: string[];
}

export type TripStatus = "saved" | "needs_clarification" | "researching" | "ready" | "failed";

export interface Preferences {
  diet?: string;
  budget?: string;
  notes?: string;
}

export interface SavedPost {
  id: string;
  source_url: string;
  place_name: string | null;
  note: string;
  created_at: string;
}

export interface Candidate {
  id: string;
  restaurant: string;
  menu_url: string;
  score_result: ScoreResponse;
  evidence: Evidence[];
  recommendation_reason: string | null;
  directions_url?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
}

export interface Trip {
  id: string;
  destination: string | null;
  preferences: Preferences;
  status: TripStatus;
  saves: SavedPost[];
  candidates: Candidate[];
  recommended_candidate_ids: string[];
  selected_candidate_id: string | null;
  clarification: string | null;
  messages: Message[];
  decisions: DecisionTrace[];
}

export interface CreateTripRequest {
  destination?: string;
  preferences?: Preferences;
}

export interface CreateTripResponse {
  trip_id: string;
  access_token: string;
}

export interface TripMessageRequest {
  client_message_id: string;
  text: string;
  source_url?: string;
  selected_candidate_id?: string;
}

export interface TripMessageResponse {
  trip: Trip;
  reply: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean };
  trip_id?: string;
}
