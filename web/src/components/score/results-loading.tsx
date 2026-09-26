"use client";

import { Loader2Icon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useElapsed } from "@/hooks/use-elapsed";

export function ResultsLoading({ restaurant }: { restaurant: string }) {
  const elapsed = useElapsed();

  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span>
          Reading {restaurant}&rsquo;s menu and asking Jev about each dish…
        </span>
        <span className="ml-auto tabular-nums">{elapsed.toFixed(1)}s</span>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
