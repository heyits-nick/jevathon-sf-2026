"""Wire schema for the shared contract in docs/architecture.md.

Field names and shapes here are canonical — changes must be coordinated with
web/, photon/, and voice/ per AGENTS.md rule 7.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ScoreRequest(BaseModel):
    restaurant: str
    menu_url: str
    diet: str


class EvidenceOut(BaseModel):
    id: str
    url: str
    quote: str
    kind: Literal["menu", "review", "diet_site"]
    checked_at: str


class ScoredDishOut(BaseModel):
    name: str
    verdict: Literal["yes", "no", "unclear"]
    confidence: float
    source: str
    jev_ms: int
    evidence_ids: list[str] = Field(default_factory=list)


class ScoreAggregate(BaseModel):
    score: float
    confidence: float


class ScoreResponse(BaseModel):
    restaurant: str
    diet: str
    score: float
    confidence: float
    escalated: bool
    before_escalation: Optional[ScoreAggregate] = None
    dishes: list[ScoredDishOut]
    timing_ms: dict[str, int]
    jev_cost_usd: Optional[float] = None
    evidence: list[EvidenceOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class Preferences(BaseModel):
    diet: Optional[str] = None
    budget: Optional[str] = None
    notes: Optional[str] = None


class CreateTripRequest(BaseModel):
    destination: Optional[str] = None
    preferences: Preferences = Field(default_factory=Preferences)


class CreateTripResponse(BaseModel):
    trip_id: str
    access_token: str


class SavedPostOut(BaseModel):
    id: str
    source_url: str
    place_name: Optional[str]
    note: str
    created_at: datetime


class MessageOut(BaseModel):
    id: str
    role: str
    text: str
    created_at: datetime


class DecisionTraceOut(BaseModel):
    id: str
    stage: str
    model: str
    # The contract types these as optional: absent when unavailable, not null.
    choice: Optional[str] = Field(default=None, exclude_if=lambda v: v is None)
    confidence: Optional[float] = Field(default=None, exclude_if=lambda v: v is None)
    evidence_ids: list[str] = Field(default_factory=list)
    duration_ms: int
    created_at: datetime

    @field_validator("evidence_ids", mode="before")
    @classmethod
    def _null_evidence_is_empty(cls, value):
        return [] if value is None else value


class TripOut(BaseModel):
    id: str
    destination: Optional[str]
    preferences: Preferences
    status: str
    saves: list[SavedPostOut]
    candidates: list[dict] = Field(default_factory=list)
    recommended_candidate_ids: list[str] = Field(default_factory=list)
    selected_candidate_id: Optional[str]
    clarification: Optional[str]
    messages: list[MessageOut]
    decisions: list[DecisionTraceOut] = Field(default_factory=list)


class PostMessageRequest(BaseModel):
    client_message_id: str
    text: str = ""
    source_url: Optional[str] = None
    selected_candidate_id: Optional[str] = None


class PostMessageResponse(BaseModel):
    trip: TripOut
    reply: str


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool


class ErrorResponse(BaseModel):
    error: ErrorBody
    trip_id: Optional[str] = None
