"""Trip API: POST /trips, GET /trips/{id}, POST /trips/{id}/messages.

Scope of this slice: durable trip creation and message capture, including
turning any message that carries a `source_url` (or free-text note) into a
`SavedPost` — the "user memory" that Photon, web, and voice all read back
through the same `Trip`. Jev-backed intent classification, research, and
scoring are a later slice (see docs/roadmap.md P0/P1); nothing here fabricates
those decisions.
"""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from . import auth
from .models import SavedPost, Trip, TripMessage
from .schemas import (
    CreateTripRequest,
    CreateTripResponse,
    MessageOut,
    Preferences,
    PostMessageRequest,
    PostMessageResponse,
    SavedPostOut,
    TripOut,
)
from .storage import get_session, init_db


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
def post_message(
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
        reply_text = "Saved. I'll research this once I have your preferences."
    else:
        reply_text = "Got your message. Intent handling and recommendations are coming in a later update."

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
