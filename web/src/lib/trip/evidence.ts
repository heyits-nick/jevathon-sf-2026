import type { Candidate, Evidence, Trip } from "@/lib/api/types";

export function collectEvidence(candidates: Candidate[], extra: Evidence[] = []): Evidence[] {
  const merged = new Map<string, Evidence>();
  for (const e of extra) merged.set(e.id, e);
  for (const candidate of candidates) {
    for (const e of [...candidate.evidence, ...(candidate.score_result.evidence ?? [])]) {
      merged.set(e.id, e);
    }
  }
  return [...merged.values()];
}

export function tripEvidence(trip: Trip): Evidence[] {
  return collectEvidence(trip.candidates);
}

export function resolveChoiceLabel(choice: string | undefined, candidates: Candidate[]): string {
  if (!choice) return "No single choice";
  return candidates.find((c) => c.id === choice)?.restaurant ?? choice.replaceAll("_", " ");
}

export function resolveOptionLabel(option: string, candidates: Candidate[]): string {
  return candidates.find((c) => c.id === option)?.restaurant ?? option.replaceAll("_", " ");
}
