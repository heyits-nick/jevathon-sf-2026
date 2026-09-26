"""Trip API: POST /trips, GET /trips/{id}, POST /trips/{id}/messages.

Scope of this slice: durable trip creation and message capture, including
turning any message that carries a `source_url` (or free-text note) into a
`SavedPost` — the "user memory" that Photon, web, and voice all read back
through the same `Trip`. Jev-backed intent classification, research, and
scoring are a later slice (see docs/roadmap.md P0/P1); nothing here fabricates
those decisions.
"""

import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from . import auth, jev_client, menu_fetch_client, preference_extraction
from .jev_client import JevError
from .menu_fetch_client import MenuFetchError
from .models import SavedPost, Trip, TripMessage
from .schemas import (
    CreateTripRequest,
    CreateTripResponse,
    EvidenceOut,
    MessageOut,
    Preferences,
    PostMessageRequest,
    PostMessageResponse,
    SavedPostOut,
    ScoreRequest,
    ScoreResponse,
    ScoredDishOut,
    TripOut,
)
from .storage import get_session, init_db

MAX_DISHES_PER_SCORE = 50
PREFERENCE_MIN_CONFIDENCE = 0.7


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        retryable: bool = False,
        trip_id: Optional[str] = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable
        self.trip_id = trip_id


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Jevathon trip backend", lifespan=lifespan)


@app.exception_handler(ApiError)
def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
    body: dict = {"error": {"code": exc.code, "message": exc.message, "retryable": exc.retryable}}
    if exc.trip_id:
        body["trip_id"] = exc.trip_id
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
def handle_validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    # docs/architecture.md specifies 400 for validation failures; FastAPI's
    # default is 422 with a different body shape, so normalize both.
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "INVALID_REQUEST", "message": "Request did not match the expected shape.", "retryable": False}},
    )


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "UNAUTHENTICATED", "Missing or malformed Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise ApiError(401, "UNAUTHENTICATED", "Missing or malformed Authorization header.")
    return token


def _get_authorized_trip(trip_id: str, authorization: Optional[str], session: Session) -> Trip:
    token = _extract_bearer_token(authorization)
    trip = session.get(Trip, trip_id)
    if trip is None:
        raise ApiError(404, "TRIP_NOT_FOUND", "No trip with that ID.")
    if not auth.tokens_match(token, trip.token_hash):
        raise ApiError(403, "FORBIDDEN", "Token does not authorize this trip.", trip_id=trip_id)
    return trip


def _serialize_trip(trip: Trip, session: Session) -> TripOut:
    saves = session.exec(
        select(SavedPost).where(SavedPost.trip_id == trip.id).order_by(SavedPost.created_at)
    ).all()
    messages = session.exec(
        select(TripMessage).where(TripMessage.trip_id == trip.id).order_by(TripMessage.created_at)
    ).all()
    return TripOut(
        id=trip.id,
        destination=trip.destination,
        preferences=Preferences(diet=trip.diet, budget=trip.budget, notes=trip.notes),
        status=trip.status,
        saves=[SavedPostOut(**s.model_dump()) for s in saves],
        candidates=[],
        recommended_candidate_ids=[],
        selected_candidate_id=trip.selected_candidate_id,
        clarification=trip.clarification,
        messages=[MessageOut(id=m.id, role=m.role, text=m.text, created_at=m.created_at) for m in messages],
        decisions=[],
    )


async def _handle_preference_message(trip: Trip, text: str, session: Session) -> str:
    """Free text with no source_url: code proposes candidate diet/budget
    values (regex, never Jev — see preference_extraction.py), then Jev
    judges whether the message really asserts each one. Jev is never asked
    to invent a preference value, only to confirm or reject a candidate."""
    candidates = preference_extraction.extract_candidates(text)
    if not candidates:
        return "Got your message. Intent handling and recommendations are coming in a later update."

    try:
        confirmations = await jev_client.confirm_preference_candidates(text, candidates)
    except JevError:
        raise ApiError(502, "PROVIDER_FAILURE", "Jev is unavailable.", retryable=True)

    accepted: list[str] = []
    unclear: list[str] = []
    for field, value in candidates.items():
        answer = confirmations[field]
        if answer.choice == "yes" and answer.confidence >= PREFERENCE_MIN_CONFIDENCE:
            setattr(trip, field, value)
            accepted.append(f"{field}={value}")
        elif answer.choice != "no":
            # "unclear", or a low-confidence "yes" — don't silently apply it.
            unclear.append(field)
        # "no": the extractor's guess wasn't what they meant; skip quietly.

    reply_parts = []
    if accepted:
        reply_parts.append(f"Updated your preferences: {', '.join(accepted)}.")
    if unclear:
        trip.status = "needs_clarification"
        trip.clarification = f"Did you mean to update your {' and '.join(unclear)} preference? Please confirm."
        reply_parts.append(trip.clarification)
    elif accepted and trip.status == "needs_clarification":
        trip.status = "saved"
        trip.clarification = None

    return " ".join(reply_parts) if reply_parts else (
        "Got your message. Intent handling and recommendations are coming in a later update."
    )


@app.post("/score", response_model=ScoreResponse)
async def score_restaurant(payload: ScoreRequest) -> ScoreResponse:
    fetch_start = time.monotonic()
    try:
        fetch_result = await menu_fetch_client.fetch_menu(payload.menu_url, payload.restaurant)
    except MenuFetchError as exc:
        if exc.code == "UNSUPPORTED_SOURCE":
            # Contract: an unreadable menu (e.g. a PDF) is 422 NO_MENU_EVIDENCE.
            raise ApiError(422, "NO_MENU_EVIDENCE", exc.message, False)
        raise ApiError(exc.status, exc.code, exc.message, exc.retryable)
    fetch_ms = int((time.monotonic() - fetch_start) * 1000)

    dishes = fetch_result.get("dishes") or []
    if not dishes:
        raise ApiError(422, "NO_MENU_EVIDENCE", "No dishes could be extracted from this menu.")

    warnings: list[str] = []
    if len(dishes) > MAX_DISHES_PER_SCORE:
        dishes = dishes[:MAX_DISHES_PER_SCORE]
        warnings.append(f"Only the first {MAX_DISHES_PER_SCORE} dishes were scored.")

    try:
        verdicts = await jev_client.score_dishes(diet=payload.diet, dishes=dishes)
    except JevError:
        raise ApiError(502, "PROVIDER_FAILURE", "Jev is unavailable.", retryable=True)

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

    yes_min_confidence = float(os.environ.get("YES_MIN_CONFIDENCE", "0.8"))
    qualifying = sum(1 for d in dish_outs if d.verdict == "yes" and d.confidence >= yes_min_confidence)
    score = qualifying / len(dish_outs)
    confidence = sum(d.confidence for d in dish_outs) / len(dish_outs)

    return ScoreResponse(
        restaurant=fetch_result.get("restaurant") or payload.restaurant,
        diet=payload.diet,
        score=score,
        confidence=confidence,
        # No evidence-escalation adapter (reviews/diet-site fetch) exists yet
        # in backend/menu_fetch, so this slice never escalates — that's an
        # honest scope limit, not a decision this code is faking on Jev's behalf.
        escalated=False,
        before_escalation=None,
        dishes=dish_outs,
        timing_ms={"fetch": fetch_ms, "jev_total": sum(v.duration_ms for v in verdicts[:1])},
        jev_cost_usd=None,  # no verified per-token pricing to convert honestly; never invent one
        evidence=[EvidenceOut(**e) for e in fetch_result.get("evidence") or []],
        warnings=warnings,
    )


@app.post("/trips", response_model=CreateTripResponse, status_code=201)
def create_trip(payload: CreateTripRequest, session: Session = Depends(get_session)) -> CreateTripResponse:
    token = auth.generate_token()
    trip = Trip(
        destination=payload.destination,
        diet=payload.preferences.diet,
        budget=payload.preferences.budget,
        notes=payload.preferences.notes,
        token_hash=auth.hash_token(token),
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return CreateTripResponse(trip_id=trip.id, access_token=token)


@app.get("/trips/{trip_id}", response_model=TripOut)
def read_trip(
    trip_id: str,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> TripOut:
    trip = _get_authorized_trip(trip_id, authorization, session)
    return _serialize_trip(trip, session)


@app.post("/trips/{trip_id}/messages", response_model=PostMessageResponse)
async def post_message(
    trip_id: str,
    payload: PostMessageRequest,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> PostMessageResponse:
    trip = _get_authorized_trip(trip_id, authorization, session)

    text = (payload.text or "").strip()
    source_url = (payload.source_url or "").strip()
    if not text and not source_url and not payload.selected_candidate_id:
        raise ApiError(
            400, "EMPTY_MESSAGE", "Provide text, a source URL, or a selected candidate ID.", trip_id=trip_id
        )

    existing_user_message = session.exec(
        select(TripMessage).where(
            TripMessage.trip_id == trip_id,
            TripMessage.client_message_id == payload.client_message_id,
            TripMessage.role == "user",
        )
    ).first()

    if existing_user_message is not None:
        same_payload = (
            existing_user_message.text == text
            and (existing_user_message.source_url or "") == source_url
            and existing_user_message.selected_candidate_id == payload.selected_candidate_id
        )
        if not same_payload:
            raise ApiError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "client_message_id was already used with different content.",
                trip_id=trip_id,
            )
        existing_reply = session.exec(
            select(TripMessage).where(
                TripMessage.trip_id == trip_id,
                TripMessage.client_message_id == payload.client_message_id,
                TripMessage.role == "assistant",
            )
        ).first()
        return PostMessageResponse(
            trip=_serialize_trip(trip, session), reply=existing_reply.text if existing_reply else ""
        )

    if payload.selected_candidate_id:
        # No candidates exist until the scoring/research slice lands; any
        # selection today is by definition unknown.
        raise ApiError(
            422,
            "UNKNOWN_CANDIDATE",
            "selected_candidate_id does not match a researched candidate on this trip.",
            trip_id=trip_id,
        )

    session.add(
        TripMessage(
            trip_id=trip_id,
            client_message_id=payload.client_message_id,
            role="user",
            text=text,
            source_url=source_url or None,
            selected_candidate_id=payload.selected_candidate_id,
        )
    )

    if source_url:
        # A link is an unambiguous save — no intent classification needed.
        # Plain free text is not turned into a SavedPost here: telling "save
        # this place" apart from "make this vegan" is Jev's intent stage
        # (docs/architecture.md), not a heuristic this slice should guess at.
        session.add(SavedPost(trip_id=trip_id, source_url=source_url, note=text))
        # Trip research is not wired yet; don't promise it. Scoring is available via POST /score.
        reply_text = "Saved to your trip. Automatic menu research for saved places isn't available yet."
    else:
        reply_text = await _handle_preference_message(trip, text, session)

    session.add(trip)

    session.add(
        TripMessage(
            trip_id=trip_id,
            client_message_id=payload.client_message_id,
            role="assistant",
            text=reply_text,
        )
    )
    session.commit()

    return PostMessageResponse(trip=_serialize_trip(trip, session), reply=reply_text)
