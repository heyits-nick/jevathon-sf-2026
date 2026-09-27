"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ExternalLinkIcon, Loader2Icon, NavigationIcon, SearchCheckIcon, SparklesIcon } from "lucide-react";
import { DishList } from "@/components/score/dish-list";
import { ScoreResult, ScoreWarnings } from "@/components/score/score-result";
import { ScoreFigure, VerdictBar } from "@/components/score/verdict-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const PREVIEW_DISHES = 5;

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
  const [expanded, setExpanded] = useState(false);
  const result = candidate.score_result;
  const choosing = selection?.status === "sending";
  const featured = !collapsed;
  const details = (
    <ScoreResult
      result={result}
      evidence={candidateEvidence(candidate)}
      showRestaurantName={false}
      showTrace={false}
      showSummary={false}
    />
  );

  const badges = (
    <div className="flex flex-wrap items-center gap-2 empty:hidden">
      {rank !== undefined && (
        <Badge className="h-7 px-3 text-[0.8rem]">
          <SparklesIcon data-icon="inline-start" className="text-brand" />
          {rank === 1 ? "Recommended" : `Recommended #${rank}`}
        </Badge>
      )}
      {selected && (
        <Badge variant="outline" className="h-7 border-transparent bg-success/10 px-3 text-[0.8rem] text-success">
          <CheckIcon data-icon="inline-start" />
          Your choice
        </Badge>
      )}
      {result.escalated && (
        <Badge variant="outline" className="h-7 px-3 text-[0.8rem]">
          <SearchCheckIcon data-icon="inline-start" />
          Escalated to reviews
        </Badge>
      )}
    </div>
  );

  const links = (
    <>
      <a
        href={candidate.menu_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded text-sm text-foreground/80 underline-offset-4 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
      >
        Menu on {hostname(candidate.menu_url)}
        <ExternalLinkIcon className="size-3.5" aria-hidden />
      </a>
      {candidate.directions_url && (
        <a
          href={candidate.directions_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded text-sm text-foreground/80 underline-offset-4 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
        >
          <NavigationIcon className="size-3.5" aria-hidden />
          Directions
        </a>
      )}
    </>
  );

  const chooseButton = !selected && (
    <Button
      size={featured ? "lg" : "default"}
      variant={featured ? "default" : "outline"}
      className="ml-auto"
      onClick={() => onChoose(candidate)}
      disabled={selectionLocked}
    >
      {choosing ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      {choosing ? "Choosing…" : featured ? "Choose this place" : "Choose"}
    </Button>
  );

  const selectionError = selection?.status === "failed" && (
    <InlineError message={selection.error ?? "Couldn’t save your choice."} onRetry={onRetry} />
  );

  if (!featured) {
    return (
      <article className={cn("space-y-4 rounded-2xl border bg-card p-5 sm:p-6", selected && "ring-2 ring-success")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h3 className="font-display text-2xl font-bold tracking-tight">{candidate.restaurant}</h3>
            {badges}
            {candidate.recommendation_reason && (
              <p className="max-w-xl text-pretty text-sm text-muted-foreground">{candidate.recommendation_reason}</p>
            )}
          </div>
          <ScoreFigure result={result} size="sm" />
        </div>
        <VerdictBar result={result} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {links}
          {chooseButton}
        </div>
        {selectionError}
        <div className="border-t pt-3">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
            Dish-by-dish results
          </Button>
          {expanded && <div className="mt-4">{details}</div>}
        </div>
      </article>
    );
  }

  const hiddenDishes = result.dishes.length - PREVIEW_DISHES;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-3xl border bg-card shadow-[0_1px_2px_oklch(0.21_0.006_85/4%),0_16px_40px_-20px_oklch(0.21_0.006_85/22%)]",
        selected && "ring-2 ring-success",
      )}
    >
      <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8 sm:p-8">
        <div className="min-w-0 space-y-3">
          {badges}
          <h3 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">{candidate.restaurant}</h3>
          {candidate.recommendation_reason && (
            <p className="max-w-xl text-pretty text-[0.95rem] leading-relaxed text-foreground/80">{candidate.recommendation_reason}</p>
          )}
        </div>
        <ScoreFigure result={result} />
      </div>

      <div className="border-t px-6 py-5 sm:px-8">
        <VerdictBar result={result} />
      </div>

      <div className="border-t px-6 py-2 sm:px-8">
        {expanded ? (
          <div className="py-4">{details}</div>
        ) : (
          <>
            {/* The expanded details repeat these; collapsed, they stay beside the choice. */}
            {result.warnings?.length ? (
              <div className="space-y-2 pt-4">
                <ScoreWarnings warnings={result.warnings} />
              </div>
            ) : null}
            <DishList dishes={result.dishes} limit={PREVIEW_DISHES} />
          </>
        )}
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
          {expanded
            ? "Show less"
            : hiddenDishes > 0
              ? `Show all ${result.dishes.length} dishes, sources and timing`
              : "Show full results"}
        </Button>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t bg-sidebar px-6 py-4 sm:px-8">
        {links}
        {chooseButton}
        {selectionError && <div className="basis-full">{selectionError}</div>}
      </footer>
    </article>
  );
}
