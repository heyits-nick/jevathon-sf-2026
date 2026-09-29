"""POST /trips/{id}/messages: preference-update interpretation.

Code (preference_extraction.py) proposes candidate diet/budget values from
free text via regex/keywords; Jev only confirms whether the message really
asserts each one. These tests fake Jev's confirmation per this repo's
testing convention — see test_score.py's module docstring.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, text

from backend_scoring import jev_client
from backend_scoring.jev_client import ChoiceAnswer, JevError
from backend_scoring.models import DecisionTrace
from backend_scoring.storage import get_engine


def _create_trip(client: TestClient) -> tuple[str, str]:
    resp = client.post("/trips", json={})
    body = resp.json()
    return body["trip_id"], body["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_confirmed_preference_updates_the_trip(client: TestClient, monkeypatch):
    monkeypatch.setenv("JEV_MODEL", "jev-test-model")
    async def fake_confirm(message_text, candidates):
        return {field: ChoiceAnswer(choice="yes", confidence=0.95, duration_ms=50) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fake_confirm)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "Make this vegan and under $25"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trip"]["preferences"]["diet"] == "vegan"
    assert body["trip"]["preferences"]["budget"] == "under $25"
    assert body["trip"]["status"] == "saved"
    assert "Updated your preferences" in body["reply"]
    assert body["trip"]["saves"] == []  # a preference update is not a saved post

    decisions = body["trip"]["decisions"]
    assert len(decisions) == 2  # one DecisionTrace per confirmed candidate (diet, budget)
    stages = {d["stage"] for d in decisions}
    assert stages == {"preference:diet", "preference:budget"}
    for d in decisions:
        assert d["choice"] == "yes"
        assert d["confidence"] == 0.95
        assert d["model"] == "jev-test-model"  # the model the request was sent to
        assert d["id"] and d["created_at"]
    # One batched call answered both fields: its 50 ms is counted once, so
    # summing the trace (as the web console does) gives the real Jev time.
    assert sorted(d["duration_ms"] for d in decisions) == [0, 50]


def test_decision_trace_is_recorded_even_when_clarification_is_needed(client: TestClient, monkeypatch):
    async def fake_confirm(message_text, candidates):
        return {field: ChoiceAnswer(choice="unclear", confidence=0.5, duration_ms=80) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fake_confirm)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "vegan maybe"},
    )
    decisions = resp.json()["trip"]["decisions"]
    assert len(decisions) == 1
    assert decisions[0]["stage"] == "preference:diet"
    assert decisions[0]["choice"] == "unclear"


def test_decisions_accumulate_across_messages_in_order(client: TestClient, monkeypatch):
    trip_id, token = _create_trip(client)

    async def confirm_diet(message_text, candidates):
        return {field: ChoiceAnswer(choice="yes", confidence=0.9, duration_ms=40) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", confirm_diet)
    client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "vegan please"},
    )

    async def confirm_budget(message_text, candidates):
        return {field: ChoiceAnswer(choice="yes", confidence=0.9, duration_ms=40) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", confirm_budget)
    client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "under $40"},
    )

    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    stages = [d["stage"] for d in trip["decisions"]]
    assert stages == ["preference:diet", "preference:budget"]  # in the order they happened


def test_jev_no_still_records_a_decision(client: TestClient, monkeypatch):
    async def fake_confirm(message_text, candidates):
        return {field: ChoiceAnswer(choice="no", confidence=0.9, duration_ms=30) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fake_confirm)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "not vegan, thanks"},
    )
    decisions = resp.json()["trip"]["decisions"]
    assert len(decisions) == 1
    assert decisions[0]["choice"] == "no"


def test_no_decision_recorded_when_jev_is_never_called(client: TestClient, monkeypatch):
    def fail_if_called(*args, **kwargs):
        pytest.fail("Jev should not be called when no candidate was extracted")

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fail_if_called)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "what time do you open"},
    )
    assert resp.json()["trip"]["decisions"] == []


def test_trace_without_evidence_ids_is_rejected_on_write(client: TestClient):
    trip_id, _ = _create_trip(client)
    with Session(get_engine()) as session:
        session.add(DecisionTrace(trip_id=trip_id, stage="test", model="m", evidence_ids=None, duration_ms=1))
        with pytest.raises(IntegrityError):
            session.commit()


def test_trace_fields_jev_did_not_answer_are_absent(client: TestClient):
    trip_id, token = _create_trip(client)
    with Session(get_engine()) as session:
        session.add(DecisionTrace(trip_id=trip_id, stage="test", model="m", duration_ms=1))
        session.commit()
        # A row written before evidence_ids was NOT NULL may hold JSON null.
        session.exec(text("UPDATE decisiontrace SET evidence_ids = 'null'"))
        session.commit()

    decision = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()["decisions"][0]
    assert "choice" not in decision and "confidence" not in decision  # absent, not null
    assert decision["evidence_ids"] == []


def test_low_confidence_yes_does_not_apply_and_asks_for_clarification(client: TestClient, monkeypatch):
    async def fake_confirm(message_text, candidates):
        return {field: ChoiceAnswer(choice="yes", confidence=0.4, duration_ms=50) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fake_confirm)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "maybe vegan?"},
    )
    body = resp.json()
    assert body["trip"]["preferences"]["diet"] is None
    assert body["trip"]["status"] == "needs_clarification"
    assert body["trip"]["clarification"]


def test_jev_no_leaves_preference_unchanged_without_clarification(client: TestClient, monkeypatch):
    async def fake_confirm(message_text, candidates):
        return {field: ChoiceAnswer(choice="no", confidence=0.9, duration_ms=50) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fake_confirm)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "not vegan, thanks"},
    )
    body = resp.json()
    assert body["trip"]["preferences"]["diet"] is None
    assert body["trip"]["status"] == "saved"
    assert body["trip"]["clarification"] is None


def test_jev_outage_during_preference_confirmation_is_a_visible_failure(client: TestClient, monkeypatch):
    async def fake_confirm(message_text, candidates):
        raise JevError("down")

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fake_confirm)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "vegan please"},
    )
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "PROVIDER_FAILURE"

    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert trip["decisions"] == []  # no completed Jev response, so nothing is recorded


def test_message_with_no_preference_keywords_never_calls_jev(client: TestClient, monkeypatch):
    def fail_if_called(*args, **kwargs):
        pytest.fail("Jev should not be called when no candidate was extracted")

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fail_if_called)

    trip_id, token = _create_trip(client)
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "what time do you open"},
    )
    assert resp.status_code == 200
    assert "Share a link" in resp.json()["reply"]


def test_clarification_clears_once_a_later_message_updates_preferences(client: TestClient, monkeypatch):
    trip_id, token = _create_trip(client)

    async def unclear(message_text, candidates):
        return {field: ChoiceAnswer(choice="unclear", confidence=0.5, duration_ms=50) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", unclear)
    client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "vegan maybe"},
    )
    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert trip["status"] == "needs_clarification"

    async def confirmed(message_text, candidates):
        return {field: ChoiceAnswer(choice="yes", confidence=0.95, duration_ms=50) for field in candidates}

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", confirmed)
    client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "yes, vegan"},
    )
    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert trip["status"] == "saved"
    assert trip["clarification"] is None
    assert trip["preferences"]["diet"] == "vegan"
