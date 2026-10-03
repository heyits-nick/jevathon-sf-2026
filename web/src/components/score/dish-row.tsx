import { MessageSquareTextIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getVerdictDisplay } from "@/lib/score/verdict";
import type { Dish } from "@/lib/api/types";
import { ConfidenceBar } from "./confidence-bar";
import { VerdictBadge } from "./verdict-badge";

export function DishRow({ dish }: { dish: Dish }) {
  const { tone } = getVerdictDisplay(dish);
  const usedReviews = dish.source === "menu+reviews";

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2 py-3.5 sm:grid-cols-[1fr_10rem_8.5rem]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[0.95rem] font-medium">{dish.name}</span>
        {usedReviews && (
          <Tooltip>
            <TooltipTrigger render={<span className="shrink-0 text-muted-foreground" />}>
              <MessageSquareTextIcon className="size-3.5" aria-label="Re-scored with reviews" />
            </TooltipTrigger>
            <TooltipContent>Re-scored with reviews and diet sites</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="justify-self-end sm:order-last">
        <VerdictBadge verdict={dish.verdict} confidence={dish.confidence} />
      </div>
      <ConfidenceBar value={dish.confidence} tone={tone} className="col-span-2 sm:col-span-1" />
    </li>
  );
}
