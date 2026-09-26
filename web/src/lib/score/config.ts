import type { EvidenceKind, Verdict } from "@/lib/api/types";

export const DIETS = [
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "gluten-free", label: "Gluten-free" },
];

/** Below this, a verdict is displayed as uncertain rather than trusted. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export const VERDICT_ORDER: Record<Verdict, number> = {
  yes: 0,
  unclear: 1,
  no: 2,
};

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  menu: "Menu",
  review: "Review",
  diet_site: "Diet site",
};

export const dietLabel = (diet: string) => DIETS.find((d) => d.value === diet)?.label ?? diet;
