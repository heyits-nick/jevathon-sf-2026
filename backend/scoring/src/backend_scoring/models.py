"""Durable tables backing the `Trip` contract in docs/architecture.md.

These are storage models, not the wire schema — `schemas.py` assembles the
public `Trip` shape from these rows.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def _new_id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Trip(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    destination: Optional[str] = None
    diet: Optional[str] = None
    budget: Optional[str] = None
    notes: Optional[str] = None
    status: str = "saved"
    clarification: Optional[str] = None
    selected_candidate_id: Optional[str] = None
    token_hash: str
    created_at: datetime = Field(default_factory=_now)


class SavedPost(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    source_url: str = ""
    place_name: Optional[str] = None
    note: str = ""
    created_at: datetime = Field(default_factory=_now)


class TripMessage(SQLModel, table=True):
    """One row per message turn. A user turn and its assistant reply share
    `client_message_id`; the unique constraint scopes idempotency to a single
    trip and role so a replay can be detected without an extra lookup table.
    """

    __table_args__ = (
        UniqueConstraint("trip_id", "client_message_id", "role", name="uq_trip_message_idem"),
    )

    id: str = Field(default_factory=_new_id, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    client_message_id: str = Field(index=True)
    role: str  # "user" | "assistant"
    text: str = ""
    source_url: Optional[str] = None
    selected_candidate_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
