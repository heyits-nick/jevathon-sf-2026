"use client";

import { CheckIcon, ExternalLinkIcon, Loader2Icon, NavigationIcon, SparklesIcon } from "lucide-react";
import { ScoreResult } from "@/components/score/score-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { hostname } from "@/lib/format";
import { candidateEvidence } from "@/lib/trip/candidates";
import type { Candidate } from "@/lib/api/types";
import { InlineError } from "./inline-error";

export interface SelectionState {
  status: "sending" | "failed";
  error?: string;
}

interface CandidateCardProps {
  candidate: Candidate;
  rank?: number;
  selected: boolean;
  selection?: SelectionState;
  selectionLocked: boolean;
  onChoose: (candidate: Candidate) => void;
  onRetry: () => void;
  collapsed?: boolean;
}

export function CandidateCard({
  candidate,
  rank,
  selected,
  selection,
  selectionLocked,
  onChoose,
  onRetry,
  collapsed = false,
}: CandidateCardProps) {
  const choosing = selection?.status === "sending";
  const details = (
    <ScoreResult
      result={candidate.score_result}
      evidence={candidateEvidence(candidate)}
      showRestaurantName={false}
      showTrace={false}
    />
  );

  return (
    <Card className={cn(selected && "ring-2 ring-success")}>
      <CardContent className="space-y-4">
        <h3 className="text-xl font-semibold tracking-tight">{candidate.restaurant}</h3>
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {rank !== undefined && (
            <Badge>
              <SparklesIcon data-icon="inline-start" />
              Recommended #{rank}
            </Badge>
          )}
          {selected && (
            <Badge variant="outline" className="border-transparent bg-success/10 text-success">
              <CheckIcon data-icon="inline-start" />
              Your choice
            </Badge>
          )}
        </div>

        {candidate.recommendation_reason && (
          <p className="text-pretty text-sm">
            <span className="font-medium">Why: </span>
            {candidate.recommendation_reason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a
            href={candidate.menu_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline focus-visible:underline"
          >
            Menu on {hostname(candidate.menu_url)}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
          {candidate.directions_url && (
            <a
              href={candidate.directions_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline focus-visible:underline"
            >
              <NavigationIcon className="size-3" aria-hidden />
              Directions
            </a>
          )}
          {!selected && (
            <Button size="sm" className="ml-auto" onClick={() => onChoose(candidate)} disabled={selectionLocked}>
              {choosing ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              {choosing ? "Choosing…" : "Choose this place"}
            </Button>
          )}
        </div>
        {selection?.status === "failed" && <InlineError message={selection.error ?? "Couldn’t save your choice."} onRetry={onRetry} />}

        {collapsed ? (
          <details className="group rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Dish-by-dish results</summary>
            <div className="mt-4">{details}</div>
          </details>
        ) : (
          details
        )}
      </CardContent>
    </Card>
  );
}
