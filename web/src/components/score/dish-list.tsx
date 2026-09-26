import { VERDICT_ORDER } from "@/lib/score/config";
import type { Dish } from "@/lib/api/types";
import { DishRow } from "./dish-row";

const byVerdictThenConfidence = (a: Dish, b: Dish) =>
  VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || b.confidence - a.confidence;

export function DishList({ dishes }: { dishes: Dish[] }) {
  if (dishes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No dishes were found on this menu page. It may be a PDF or image menu.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {[...dishes].sort(byVerdictThenConfidence).map((dish) => (
        <DishRow key={dish.name} dish={dish} />
      ))}
    </ul>
  );
}
