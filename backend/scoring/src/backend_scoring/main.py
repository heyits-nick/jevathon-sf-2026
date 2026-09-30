"""Trip API: POST /trips, GET /trips/{id}, POST /trips/{id}/messages.

Scope of this slice: durable trip creation and message capture, including
turning any message that carries a `source_url` (or free-text note) into a
`SavedPost` — the "user memory" that Photon, web, and voice all read back
through the same `Trip`. Jev-backed intent classification, research, and
scoring are a later slice (see docs/roadmap.md P0/P1); nothing here fabricates
those decisions.
"""

import asyncio
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import literal_column
from sqlmodel import Session, select

from . import auth, conversation, jev_client, menu_fetch_client, preference_extraction, research, scoring
from .jev_client import JevError
from .menu_fetch_client import MenuFetchError
from sqlalchemy.exc import IntegrityError

from .models import DecisionTrace, ResearchCandidate, ResearchRun, SavedPost, Trip, TripMessage
from .schemas import (
    CreateTripRequest,
    CreateTripResponse,
    DecisionTraceOut,
    MessageOut,
    Preferences,
    PostMessageRequest,
    PostMessageResponse,
    SavedPostOut,
    ScoreRequest,
    ScoreResponse,
    TripOut,
)
from .storage import get_session, init_db

PREFERENCE_MIN_CONFIDENCE = 0.7  # on the probability Jev gave its choice; see jev_client.supported
# Preference confirmation shares the request's research budget; cap its share.
PREFERENCE_JEV_TIMEOUT_SECONDS = 15.0


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
    decisions = session.exec(
        select(DecisionTrace)
        .where(DecisionTrace.trip_id == trip.id)
        .order_by(DecisionTrace.created_at, literal_column("decisiontrace.rowid"))
    ).all()
    candidates = sorted(
        session.exec(select(ResearchCandidate).where(ResearchCandidate.trip_id == trip.id)).all(),
        key=lambda c: (c.rank is None, c.rank or 0, -c.created_at.timestamp()),
    )
    return TripOut(
        id=trip.id,
        destination=trip.destination,
        preferences=Preferences(diet=trip.diet, budget=trip.budget, notes=trip.notes),
        status=trip.status,
        saves=[SavedPostOut(**s.model_dump()) for s in saves],
        candidates=[
            {
                "id": c.id,
                "restaurant": c.restaurant,
                "menu_url": c.menu_url,
                "score_result": c.score_result,
                "evidence": c.evidence,
                "recommendation_reason": c.recommendation_reason,
            }
            for c in candidates
        ],
        recommended_candidate_ids=[c.id for c in candidates if c.rank == 0 and not c.rejected],
        selected_candidate_id=trip.selected_candidate_id,
        clarification=trip.clarification,
        messages=[MessageOut(id=m.id, role=m.role, text=m.text, created_at=m.created_at) for m in messages],
        decisions=[DecisionTraceOut(**d.model_dump()) for d in decisions],
    )


DEFAULT_REPLY = (
    "Got your message. Share a link to a post and I'll research nearby menus, "
    "or tell me your diet or budget."
)


async def _handle_preference_message(trip: Trip, text: str, session: Session, timeout: float) -> str:
    try:
        reply = await _apply_preference_text(trip, text, session, timeout)
    except JevError:
        raise ApiError(502, "PROVIDER_FAILURE", "Jev is unavailable.", retryable=True)
    return reply or DEFAULT_REPLY


async def _apply_preference_text(trip: Trip, text: str, session: Session, timeout: float) -> Optional[str]:
    """Code proposes candidate diet/budget values (regex, never Jev — see
    preference_extraction.py), then Jev judges whether the message really
    asserts each one. Jev is never asked to invent a preference value, only
    to confirm or reject a candidate. Returns None when nothing was proposed
    or applied; raises JevError when Jev is unavailable."""
    candidates = preference_extraction.extract_candidates(text)
    if not candidates:
        return None

    try:
        confirmations = await asyncio.wait_for(jev_client.confirm_preference_candidates(text, candidates), timeout)
    except asyncio.TimeoutError as exc:
        raise JevError("Jev preference confirmation timed out.") from exc

    accepted: list[str] = []
    unclear: list[str] = []
    for i, (field, value) in enumerate(candidates.items()):
        answer = confirmations[field]
        session.add(
            DecisionTrace(
                trip_id=trip.id,
                stage=f"preference:{field}",
                model=jev_client.current_model(),
                choice=answer.choice,
                confidence=answer.confidence,
                evidence_ids=[],
                # One batched call answered every field; count its time once.
                duration_ms=answer.duration_ms if i == 0 else 0,
            )
        )
        if answer.choice == "yes" and jev_client.supported(answer, PREFERENCE_MIN_CONFIDENCE):
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

    return " ".join(reply_parts) if reply_parts else None


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

    try:
        return await scoring.score_fetched_menu(payload.restaurant, payload.diet, fetch_result, fetch_ms)
    except scoring.NoMenuEvidence as exc:
        raise ApiError(422, "NO_MENU_EVIDENCE", str(exc))
    except JevError:
        raise ApiError(502, "PROVIDER_FAILURE", "Jev is unavailable.", retryable=True)


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
        # No reply yet means the first delivery is still researching; never
        # rerun paid research for a duplicate.
        return PostMessageResponse(
            trip=_serialize_trip(trip, session),
            reply=existing_reply.text if existing_reply else "Still working on that message; check back shortly.",
        )

    candidate = None
    if payload.selected_candidate_id:
        candidate = session.get(ResearchCandidate, payload.selected_candidate_id)
        if candidate is None or candidate.trip_id != trip_id:
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

    if candidate is not None:
        # An explicit human choice; Jev never overrides it.
        trip.selected_candidate_id = candidate.id
        reply_text = f"Saved your choice: {candidate.restaurant}."
    elif source_url:
        reply_text = await _handle_shared_link(trip, text, source_url, payload.client_message_id, session)
    else:
        reply_text = await _handle_text(trip, text, payload.client_message_id, session)

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


def _commit_user_message(session: Session, trip_id: str, client_message_id: str) -> None:
    """Persist the user's input before paid work, so a duplicate delivery
    sees it and does not start a second research run."""
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError(
            409, "DUPLICATE_IN_PROGRESS", "This message is already being processed.", retryable=True, trip_id=trip_id
        )


def _release_user_message(session: Session, trip_id: str, client_message_id: str) -> None:
    """Undo _commit_user_message when the message fails without a reply, so
    its retry is handled instead of being told it is still in progress."""
    session.rollback()
    message = session.exec(
        select(TripMessage).where(
            TripMessage.trip_id == trip_id,
            TripMessage.client_message_id == client_message_id,
            TripMessage.role == "user",
        )
    ).first()
    if message is not None:
        session.delete(message)
        session.commit()


async def _handle_shared_link(trip: Trip, text: str, source_url: str, client_message_id: str, session: Session) -> str:
    save = SavedPost(trip_id=trip.id, source_url=source_url, note=text)
    session.add(save)
    _commit_user_message(session, trip.id, client_message_id)
    budget = research.Budget(research.budget_seconds())  # the whole request, not just research

    preference_reply = None
    if text:
        try:
            preference_reply = await _apply_preference_text(trip, text, session, budget.step(PREFERENCE_JEV_TIMEOUT_SECONDS))
        except JevError:
            # Newest link wins: a link shared while this one waited owns the trip's status.
            newer_save = session.exec(
                select(SavedPost).where(SavedPost.trip_id == trip.id, SavedPost.created_at > save.created_at)
            ).first()
            if newer_save is None:
                trip.status = "failed"
            return "I saved the link, but Jev (our decision service) was unavailable, so I couldn't research it. Share it again to retry."
    reply = await research.research_shared_link(session, trip, save, budget)
    return f"{preference_reply} {reply}" if preference_reply else reply


async def _converse(
    trip: Trip,
    text: str,
    session: Session,
    run: Optional[ResearchRun],
    candidates: list[ResearchCandidate],
    preference_timeout: float,
) -> str:
    if not candidates:
        return await _handle_preference_message(trip, text, session, preference_timeout)
    intent = await conversation.classify(session, trip, text, run, candidates)
    if intent == "recall":
        return await conversation.recall(session, trip, text, run, candidates)
    if intent == "alternative":
        return await conversation.alternative(session, trip, text, run, candidates)
    if intent == "update_preferences":
        return await _handle_preference_message(trip, text, session, preference_timeout)
    if intent == "unclear":
        return (
            "I'm not sure what you'd like. You can ask what I found, ask for a different restaurant, "
            "or tell me a diet or budget."
        )
    return (
        "I can tell you about the restaurants I researched, suggest another one, update your diet "
        "or budget, or research a new post if you share its link."
    )


async def _handle_text(trip: Trip, text: str, client_message_id: str, session: Session) -> str:
    _commit_user_message(session, trip.id, client_message_id)
    budget = research.Budget(research.budget_seconds())  # the whole request, not just research
    preference_timeout = budget.step(PREFERENCE_JEV_TIMEOUT_SECONDS)
    diet_before, clarification_before = trip.diet, trip.clarification
    waiting = research.waiting_run(session, trip.id)
    run, candidates = research.latest_candidates(session, trip.id)
    try:
        reply = None
        if waiting is not None and waiting.status == "needs_place":
            # The trip asked which place; a message naming one answers it.
            reply = await research.answer_place(session, trip, waiting, text, budget)
        if reply is None:
            reply = await _converse(trip, text, session, run, candidates, preference_timeout)
    except Exception as exc:
        _release_user_message(session, trip.id, client_message_id)
        if isinstance(exc, JevError):
            raise ApiError(502, "PROVIDER_FAILURE", "Jev is unavailable.", retryable=True, trip_id=trip.id) from exc
        raise

    if waiting is None or waiting.status not in ("needs_place", "needs_diet"):
        return reply
    # A place identified earlier may have been waiting only for a diet, and
    # only the message that supplies it resumes that research.
    if waiting.status == "needs_diet" and trip.diet and not diet_before:
        return f"{reply} {await research.research_place(session, trip, waiting, budget)}"
    # A preference update cleared the trip's question, but the run still needs its answer.
    if clarification_before and trip.clarification is None:
        trip.status = "needs_clarification"
        trip.clarification = research.pending_question(waiting)
        reply = f"{reply} {trip.clarification}"
    return reply
