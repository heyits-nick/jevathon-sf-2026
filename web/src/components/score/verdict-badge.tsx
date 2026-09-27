import { CheckIcon, CircleHelpIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getVerdictDisplay, TONE_SOFT_BG, TONE_TEXT } from "@/lib/score/verdict";
import type { Dish } from "@/lib/api/types";

const VERDICT_ICON = { yes: CheckIcon, no: XIcon, unclear: CircleHelpIcon };

export function VerdictBadge({ verdict, confidence }: Pick<Dish, "verdict" | "confidence">) {
  const { label, tone, uncertain } = getVerdictDisplay({ verdict, confidence });
  const Icon = uncertain ? CircleHelpIcon : VERDICT_ICON[verdict];

  return (
    <Badge variant="outline" className={cn("h-6 border-transparent px-2.5 font-semibold", TONE_SOFT_BG[tone], TONE_TEXT[tone])}>
      <Icon data-icon="inline-start" />
      {label}
    </Badge>
  );
}
