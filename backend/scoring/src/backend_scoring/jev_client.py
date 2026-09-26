"""Jev calls: per-dish dietary verdicts and preference-update confirmation.

Both are batched Choice questions in a single call to
POST https://api.typesafe.ai/v1/systemone (verified schema, 2026-09-26 —
see docs/handoffs/backend-status.md). Choice answers carry `confidence`;
Noul (yes/no) answers do not, which is why every judgment here is asked as
a three-way Choice (yes/no/unclear) rather than a boolean.

Each question is fully self-contained (the relevant text inlined into its
own `instructions`) rather than pointing at a shared `state` blob, per this
repo's Jev usage guidance: no property-of-a-property questions, and literal
text beats an ID Jev has to cross-reference.
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
class ChoiceAnswer:
    choice: str
    confidence: float
    duration_ms: int


# Kept as an alias: score_dishes originally returned this name and existing
# tests/callers construct it directly.
DishVerdict = ChoiceAnswer


async def ask_choice_questions(state: dict, questions: dict[str, dict]) -> dict[str, ChoiceAnswer]:
    """Send one batched call with N independent Choice questions, all
    answered yes/no/unclear with confidence. Raises JevError on anything
    that isn't a trustworthy answer for every question asked — never
    returns a partial or guessed result."""
    api_key = os.environ.get("TYPESAFE_API_KEY")
    if not api_key:
        raise JevError("TYPESAFE_API_KEY is not configured.")
    if not questions:
        return {}

    model = os.environ.get("JEV_MODEL", "jev-latest")
    payload = {"state": state, "model": model, "questions": questions}

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
    result: dict[str, ChoiceAnswer] = {}
    for qid in questions:
        answer = answers.get(qid)
        if not isinstance(answer, dict) or answer.get("type") != "choice":
            raise JevError(f"Jev returned an invalid or missing answer for {qid}.")
        choice = answer.get("choice")
        confidence = answer.get("confidence")
        if choice not in VALID_CHOICES or not isinstance(confidence, (int, float)):
            raise JevError(f"Jev returned an unexpected answer shape for {qid}: {answer!r}")
        result[qid] = ChoiceAnswer(choice=choice, confidence=float(confidence), duration_ms=duration_ms)
    return result


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


async def score_dishes(diet: str, dishes: list[dict]) -> list[ChoiceAnswer]:
    question_ids = [f"dish_{i}" for i in range(len(dishes))]
    questions = {qid: _question_for_dish(diet, dish) for qid, dish in zip(question_ids, dishes)}
    answers = await ask_choice_questions(state={"diet": diet}, questions=questions)
    return [answers[qid] for qid in question_ids]


def _question_for_preference(field: str, value: str, message_text: str) -> dict:
    return {
        "type": "choice",
        "instructions": (
            f'A trip message says: "{message_text}". Does this message clearly assert '
            f'the trip\'s {field} preference should be "{value}"? '
            "Answer strictly from the message text; do not assume anything it doesn't say."
        ),
        "criteria": {
            "yes": f'The message clearly states or requests {field} = "{value}" as the trip preference.',
            "no": f'The message does not assert {field} = "{value}" as the trip preference.',
            "unclear": "The message is ambiguous about whether this is the intended preference.",
        },
    }


async def confirm_preference_candidates(message_text: str, candidates: dict[str, str]) -> dict[str, ChoiceAnswer]:
    """`candidates` is e.g. {"diet": "vegan", "budget": "under $25"} — values
    a deterministic extractor (never Jev) proposed from the message text.
    Jev's only job here is judging whether the message really asserts each
    one, per AGENTS.md: extraction proposes, Jev interprets ambiguity."""
    questions = {
        field: _question_for_preference(field, value, message_text) for field, value in candidates.items()
    }
    return await ask_choice_questions(state={"message_excerpt": message_text[:200]}, questions=questions)
