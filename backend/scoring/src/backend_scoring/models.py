"""Durable tables backing the `Trip` contract in docs/architecture.md.

These are storage models, not the wire schema — `schemas.py` assembles the
public `Trip` shape from these rows.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column, UniqueConstraint
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


class DecisionTrace(SQLModel, table=True):
    """One row per real Jev decision scoped to a trip. Per docs/architecture.md:
    "Persist an actual trace for each decision ... Do not invent decisions
    for steps that did not call Jev" — this table exists so that rule is
    actually enforced, not just documented. Nothing writes here except a
    real, completed Jev response.

    One batched Jev call that answers several questions writes one row per
    answer. `duration_ms` is that call's wall time on the first of its rows
    and 0 on the rest, so summing the rows gives the real Jev time.
    """

    id: str = Field(default_factory=_new_id, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    stage: str
    model: str
    choice: Optional[str] = None
    confidence: Optional[float] = None
    evidence_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON(none_as_null=True), nullable=False))
    duration_ms: int
    created_at: datetime = Field(default_factory=_now)


class ResearchRun(SQLModel, table=True):
    """One automatic research attempt for a saved post. New table only — no
    existing table is altered, so older SQLite trip files keep working
    (`create_all` adds missing tables, never columns)."""

    id: str = Field(default_factory=_new_id, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    save_id: str = Field(foreign_key="savedpost.id", index=True)
    # "researching" | "needs_place" | "needs_diet" | "ready" | "failed" | "superseded"
    status: str = "researching"
    place: Optional[str] = None
    caption_excerpt: Optional[str] = None
    diet: Optional[str] = None
    warnings: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
    finished_at: Optional[datetime] = None


class ResearchCandidate(SQLModel, table=True):
    """A researched restaurant, serialized as the contract's `Candidate`.
    `rank` is Jev's ordering (0 = recommendation); None = not recommended."""

    id: str = Field(default_factory=_new_id, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    run_id: str = Field(foreign_key="researchrun.id", index=True)
    restaurant: str
    menu_url: str
    score_result: dict = Field(default_factory=dict, sa_column=Column(JSON))
    evidence: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    recommendation_reason: Optional[str] = None
    rank: Optional[int] = None
    rejected: bool = False
    created_at: datetime = Field(default_factory=_now)
