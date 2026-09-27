import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { TONE_BG, type VerdictTone } from "@/lib/score/verdict";
import { formatPercent } from "@/lib/format";

interface ConfidenceBarProps {
  value: number;
  tone: VerdictTone;
  className?: string;
}

export function ConfidenceBar({ value, tone, className }: ConfidenceBarProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress
        value={value * 100}
        aria-label="Confidence"
        className="flex-1 [&_[data-slot=progress-track]]:h-1.5"
        indicatorClassName={cn("duration-700 ease-out", TONE_BG[tone])}
      />
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{formatPercent(value)}</span>
    </div>
  );
}
