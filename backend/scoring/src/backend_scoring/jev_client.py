"""Jev per-dish dietary verdicts.

One Choice question per dish, batched into a single call to
POST https://api.typesafe.ai/v1/systemone (verified schema, 2026-09-26 —
see docs/handoffs/backend-status.md). Choice answers carry `confidence`;
Noul (yes/no) answers do not, which is why dietary fit is asked as a
three-way Choice (yes/no/unclear) rather than a boolean.

Each question is fully self-contained (dish name + description inlined into
its own `instructions`) rather than pointing at a shared `state` blob, per
this repo's Jev usage guidance: no property-of-a-property questions, and
literal text beats an ID Jev has to cross-reference.
"""

import os
import time
from dataclasses import dataclass

import httpx

JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
JEV_TIMEOUT_SECONDS = 45.0

VALID_CHOICES = {"yes", "no", "unclear"}

DIET_FIT_CRITERIA = {
    "yes": "The dish's stated ingredients and preparation contain nothing that conflicts with the diet, based only on the given menu text.",
    "no": "The dish's stated ingredients or preparation clearly conflict with the diet.",
    "unclear": "The ingredients or preparation are not fully specified, or the wording is ambiguous enough to go either way.",
}


class JevError(Exception):
    """Jev is unavailable or returned something we can't trust. Callers must
    surface this as a visible failure, never fall back to a guess."""


@dataclass
class DishVerdict:
    choice: str
    confidence: float
    duration_ms: int


def _question_for_dish(diet: str, dish: dict) -> dict:
    description = dish.get("description") or ""
    return {
        "type": "choice",
        "instructions": (
            f'Does this menu dish fit a {diet} diet? Dish name: "{dish["name"]}". '
            f'Description: "{description}". Answer strictly from this text alone; '
            "do not assume any ingredient or preparation step that isn't stated."
        ),
        "criteria": DIET_FIT_CRITERIA,
    }


async def score_dishes(diet: str, dishes: list[dict]) -> list[DishVerdict]:
    api_key = os.environ.get("TYPESAFE_API_KEY")
    if not api_key:
        raise JevError("TYPESAFE_API_KEY is not configured.")
    if not dishes:
        return []

    model = os.environ.get("JEV_MODEL", "jev-latest")
    question_ids = [f"dish_{i}" for i in range(len(dishes))]
    payload = {
        "state": {"diet": diet},
        "model": model,
        "questions": {qid: _question_for_dish(diet, dish) for qid, dish in zip(question_ids, dishes)},
    }

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=JEV_TIMEOUT_SECONDS) as client:
            response = await client.post(
                JEV_ENDPOINT,
                json=payload,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise JevError(f"Could not reach Jev: {exc}") from exc
    duration_ms = int((time.monotonic() - start) * 1000)

    if response.status_code >= 400:
        raise JevError(f"Jev returned HTTP {response.status_code}: {response.text[:200]}")

    answers = response.json().get("answers", {})
    verdicts = []
    for qid in question_ids:
        answer = answers.get(qid)
        if not isinstance(answer, dict) or answer.get("type") != "choice":
            raise JevError(f"Jev returned an invalid or missing answer for {qid}.")
        choice = answer.get("choice")
        confidence = answer.get("confidence")
        if choice not in VALID_CHOICES or not isinstance(confidence, (int, float)):
            raise JevError(f"Jev returned an unexpected answer shape for {qid}: {answer!r}")
        verdicts.append(DishVerdict(choice=choice, confidence=float(confidence), duration_ms=duration_ms))
    return verdicts
