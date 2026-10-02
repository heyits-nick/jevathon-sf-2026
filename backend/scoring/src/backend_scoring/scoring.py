"""Shared menu scoring: fetched menu evidence -> Jev per-dish verdicts ->
the contract's `ScoreResponse`. Used by `POST /score` and by trip research so
both produce identical score semantics (see docs/architecture.md)."""

import asyncio
import os

from . import jev_client
from .schemas import EvidenceOut, ScoredDishOut, ScoreResponse

MAX_DISHES_PER_SCORE = 50


class NoMenuEvidence(Exception):
    """The source had no extractable dishes; never divide by zero or invent dishes."""


async def score_fetched_menu(
    restaurant: str,
    diet: str,
    fetch_result: dict,
    fetch_ms: int,
    max_dishes: int = MAX_DISHES_PER_SCORE,
    jev_timeout: float = jev_client.JEV_TIMEOUT_SECONDS,
) -> ScoreResponse:
    dishes = fetch_result.get("dishes") or []
    if not dishes:
        raise NoMenuEvidence("No dishes could be extracted from this menu.")

    warnings: list[str] = []
    if len(dishes) > max_dishes:
        dishes = dishes[:max_dishes]
        warnings.append(f"Only the first {max_dishes} dishes were scored.")

    # JevError propagates to the caller, which must surface it visibly.
    try:
        verdicts = await asyncio.wait_for(jev_client.score_dishes(diet=diet, dishes=dishes), jev_timeout)
    except asyncio.TimeoutError as exc:
        raise jev_client.JevError("Jev dish scoring timed out.") from exc

    dish_outs = [
        ScoredDishOut(
            name=dish["name"],
            verdict=verdict.choice,
            confidence=verdict.confidence,
            source="menu",
            jev_ms=verdict.duration_ms,
            evidence_ids=dish.get("evidence_ids") or [],
        )
        for dish, verdict in zip(dishes, verdicts)
    ]

    yes_min_confidence = yes_min()
    qualifying = sum(1 for d in dish_outs if d.verdict == "yes" and d.confidence >= yes_min_confidence)
    score = qualifying / len(dish_outs)
    confidence = sum(d.confidence for d in dish_outs) / len(dish_outs)

    return ScoreResponse(
        restaurant=fetch_result.get("restaurant") or restaurant,
        diet=diet,
        score=score,
        confidence=confidence,
        # No evidence-escalation adapter (reviews/diet-site fetch) exists yet
        # in backend/menu_fetch, so this never escalates — that's an honest
        # scope limit, not a decision this code is faking on Jev's behalf.
        escalated=False,
        before_escalation=None,
        dishes=dish_outs,
        timing_ms={"fetch": fetch_ms, "jev_total": sum(v.duration_ms for v in verdicts[:1])},
        jev_cost_usd=None,  # no verified per-token pricing to convert honestly; never invent one
        evidence=[EvidenceOut(**e) for e in fetch_result.get("evidence") or []],
        warnings=warnings,
    )


def yes_min() -> float:
    return float(os.environ.get("YES_MIN_CONFIDENCE", "0.8"))
