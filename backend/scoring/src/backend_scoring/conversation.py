"""Recall and alternative requests answered from the trip's saved research.

Jev decides the intent, which saved candidate(s) a question refers to, which
restaurant the traveler is rejecting, and which alternative to offer. Replies
are assembled from stored facts only (names, dish counts, source URLs,
checked dates); nothing is looked up or invented here.
"""

from sqlmodel import Session

from . import jev_client
from .models import ResearchCandidate, ResearchRun, Trip
from .research import (
    MIN_JEV_CONFIDENCE,
    eligible,
    fact_line,
    option_keys,
    other_run_recommends,
    rank_key,
    recommend,
    summary,
    trace,
)

JEV_STEP_TIMEOUT = 15.0


def _scored_diet(trip: Trip, run: ResearchRun) -> str:
    """The diet the saved menus were judged for; a later diet change doesn't relabel them."""
    return run.diet or trip.diet or "menu"


def _diet_note(trip: Trip, run: ResearchRun) -> str:
    if run.diet and trip.diet and run.diet != trip.diet:
        return f" These menus were checked for {run.diet}, not {trip.diet}; share the link again to check them for {trip.diet}."
    return ""


def _context(run: ResearchRun, candidates: list[ResearchCandidate], diet: str) -> str:
    names = ", ".join(c.restaurant for c in candidates)
    return f"The trip has saved {diet} menu research near {run.place or 'a saved place'} covering: {names}."


async def classify(session: Session, trip: Trip, text: str, run: ResearchRun, candidates: list[ResearchCandidate]) -> str:
    answer = await jev_client.classify_intent(text, _context(run, candidates, _scored_diet(trip, run)), JEV_STEP_TIMEOUT)
    trace(session, trip.id, "intent", answer)
    return answer.choice if answer.confidence >= 0.5 else "unclear"


async def recall(session: Session, trip: Trip, text: str, run: ResearchRun, candidates: list[ResearchCandidate]) -> str:
    diet = _scored_diet(trip, run)
    active = [c for c in candidates if not c.rejected] or candidates
    options = option_keys(active)
    answer = await jev_client.choose_recall(
        text, {key: summary(c, diet) for key, c in options.items()}, JEV_STEP_TIMEOUT
    )
    chosen = options.get(answer.choice)
    trace(session, trip.id, "recall", answer, choice=chosen.restaurant if chosen else answer.choice,
          evidence_ids=[e["id"] for e in (chosen.evidence if chosen else [])][:20])
    covered = ", ".join(c.restaurant for c in active)
    if answer.choice == "none" or answer.confidence < 0.5:
        return (
            f"My saved research doesn't answer that. It covers {diet} menu checks near {run.place} for {covered}. "
            "Share another post or place and I can research it."
            + _diet_note(trip, run)
        )
    selected = active if answer.choice == "all" else [chosen]
    recommended = next((c for c in active if c.rank == 0), None)
    lines = []
    for candidate in selected:
        marker = " (current recommendation)" if candidate is recommended else ""
        lines.append(fact_line(candidate, diet).replace(":", marker + ":", 1))
    return f"From the menus I checked near {run.place}: " + " ".join(lines) + _diet_note(trip, run)


async def alternative(session: Session, trip: Trip, text: str, run: ResearchRun, candidates: list[ResearchCandidate]) -> str:
    diet = _scored_diet(trip, run)
    active = [c for c in candidates if not c.rejected]
    if not active:
        return "You've set aside every restaurant from this research. Share another post or place and I can research it."
    options = option_keys(active)
    labels = {
        key: c.restaurant + (" (currently recommended)" if c.rank == 0 else "") for key, c in options.items()
    }
    answer = await jev_client.choose_rejected(text, labels, JEV_STEP_TIMEOUT)
    rejected = options.get(answer.choice)
    trace(session, trip.id, "rejected_candidate", answer, choice=rejected.restaurant if rejected else answer.choice)
    if rejected is None or answer.confidence < MIN_JEV_CONFIDENCE:
        names = ", ".join(c.restaurant for c in active)
        return f"Which restaurant should I set aside: {names}?"

    # The traveler's explicit rejection is a human choice; record it as such.
    rejected.rejected = True
    rejected.rank = None
    rejected.recommendation_reason = "You set this one aside; kept for reference."
    session.add(rejected)
    if trip.selected_candidate_id == rejected.id:
        trip.selected_candidate_id = None

    remaining = sorted((c for c in active if c is not rejected), key=rank_key)
    for candidate in remaining:
        candidate.rank = None
    lead = f"Okay, setting aside {rejected.restaurant}."
    if not any(eligible(c) for c in remaining):
        others = "; ".join(summary(c, diet) for c in remaining)
        suffix = f" The other menus I checked: {others}." if others else ""
        return (
            f"{lead} None of the other researched menus had dishes judged {diet}-compatible with high confidence."
            f"{suffix} Share another post or place and I can research it.{_diet_note(trip, run)}"
        )
    reply = await recommend(
        session, trip, run.place or "the saved place", remaining, JEV_STEP_TIMEOUT,
        stage="alternative", lead="From the same research, Jev suggests", scored_diet=run.diet,
    )
    if other_run_recommends(session, run):
        # A newer link's research finished while Jev chose; it owns the
        # recommendation. The rejection above is still the traveler's choice.
        for candidate in remaining:
            candidate.rank = None
            candidate.recommendation_reason = None
        return (
            f"{lead} You shared a newer link while I was choosing, and its research now has the recommendation."
            f"{_diet_note(trip, run)}"
        )
    top = next((c for c in remaining if c.rank == 0), None)
    if top is not None:
        reply += f"Source: {top.menu_url}."
    return f"{lead} {reply}{_diet_note(trip, run)}".strip()
