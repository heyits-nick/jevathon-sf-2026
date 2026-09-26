import type { Candidate, Evidence, Trip } from "@/lib/api/types";

/** Splits candidates by the server's recommendation order. No client-side ranking. */
export function groupCandidates({ candidates, recommended_candidate_ids }: Pick<Trip, "candidates" | "recommended_candidate_ids">) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const recommended = recommended_candidate_ids
    .map((id) => byId.get(id))
    .filter((c): c is Candidate => c !== undefined);
  const recommendedIds = new Set(recommended.map((c) => c.id));
  const others = candidates.filter((c) => !recommendedIds.has(c.id));
  return { recommended, others };
}

export function candidateEvidence(candidate: Candidate): Evidence[] {
  const merged = new Map<string, Evidence>();
  for (const e of [...candidate.evidence, ...(candidate.score_result.evidence ?? [])]) merged.set(e.id, e);
  return [...merged.values()];
}
