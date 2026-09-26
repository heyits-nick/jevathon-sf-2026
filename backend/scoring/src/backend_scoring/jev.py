"""Minimal Jev (TypeSafe AI) call: does one dish fit one dietary preference?

Endpoint and body shape follow docs/handoffs/02-ai-backend.md and
docs/integration-runbook.md (POST /v1/systemone, bearer auth,
{state, model, questions} with a Choice question). Any failure returns an
explicit error status; there is no heuristic or LLM fallback.
"""

import json
import os
import time
import urllib.error
import urllib.request

JEV_URL = "https://api.typesafe.ai/v1/systemone"
JEV_MODEL = "jev-latest"
VERDICTS = {"yes", "no", "unclear"}


def _error(code: str, message: str, elapsed_ms: int | None = None) -> dict:
    return {
        "status": "error",
        "verdict": "unknown",
        "confidence": None,
        "error": {"code": code, "message": message},
        "jev_ms": elapsed_ms,
    }


def dish_fit(dish: str, description: str, diet: str, timeout: float = 20.0) -> dict:
    key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not key:
        return _error("jev_key_missing", "TYPESAFE_API_KEY is not set")

    body = {
        "state": f"Dish: {dish}\nMenu description: {description or '(none)'}\nDietary preference: {diet}",
        "model": JEV_MODEL,
        "questions": {
            "fit": {
                "type": "choice",
                "instructions": (
                    f"Using only the dish name and menu description supplied, decide whether "
                    f"this dish fits the '{diet}' dietary preference. Do not assume unlisted "
                    f"ingredients are absent."
                ),
                "criteria": {
                    "yes": "The supplied text clearly shows the dish fits the preference.",
                    "no": "The supplied text shows the dish does not fit the preference.",
                    "unclear": "The supplied text is insufficient to decide safely.",
                },
            }
        },
    }
    req = urllib.request.Request(
        JEV_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return _error("jev_http_error", f"Jev returned HTTP {exc.code}", _ms(start))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return _error("jev_unavailable", f"Jev call failed: {type(exc).__name__}", _ms(start))
    elapsed = _ms(start)

    answer = (payload.get("answers") or {}).get("fit") or {}
    choice = answer.get("choice")
    confidence = answer.get("confidence")
    if choice not in VERDICTS or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        return _error("jev_invalid_answer", "Jev answer missing or outside allowed values", elapsed)

    return {
        "status": "ok",
        "verdict": choice,
        "confidence": float(confidence),
        "error": None,
        "jev_ms": elapsed,
        "model": payload.get("model"),
    }


def _ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)
