"""POST /trips/{id}/messages: preference-update interpretation.

Code (preference_extraction.py) proposes candidate diet/budget values from
free text via regex/keywords; Jev only confirms whether the message really
asserts each one. These tests fake Jev's confirmation per this repo's
testing convention — see test_score.py's module docstring.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend_scoring import jev_client
from backend_scoring.jev_client import ChoiceAnswer, JevError


def _create_trip(client: TestClient) -> tuple[str, str]:
    resp = client.post("/trips", json={})
    body = resp.json()
    return body["trip_id"], body["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_confirmed_preference_updates_the_trip(client: TestClient, monkeypatch):
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
    assert "later update" in resp.json()["reply"]


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
