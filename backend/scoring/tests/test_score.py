"""Unit tests for POST /score against fake menu_fetch and Jev responses.

Per docs/integration-runbook.md's own testing philosophy: focused automated
checks use labeled fake provider/backend responses, and a live provider
credential check is a separate, manual check (documented in the PR, not
run in CI).
"""

import pytest
from fastapi.testclient import TestClient

from backend_scoring import jev_client, menu_fetch_client
from backend_scoring.jev_client import DishVerdict, JevError
from backend_scoring.menu_fetch_client import MenuFetchError


def _fake_fetch_result(dishes):
    return {
        "restaurant": "Lulla",
        "menu_url": "https://example.com/menu",
        "raw_text": "...",
        "dishes": dishes,
        "evidence": [
            {
                "id": "ev-1",
                "url": "https://example.com/menu",
                "quote": "roasted vegetable curry",
                "kind": "menu",
                "checked_at": "2026-09-26T12:00:00Z",
            }
        ],
        "timing_ms": {"fetch": 100},
    }


def test_score_aggregates_dish_verdicts(client: TestClient, monkeypatch):
    dishes = [
        {"name": "Vegetable Curry", "description": "coconut, vegetables", "evidence_ids": ["ev-1"]},
        {"name": "Chicken Caesar", "description": "chicken, romaine", "evidence_ids": ["ev-1"]},
    ]

    async def fake_fetch(menu_url, restaurant):
        return _fake_fetch_result(dishes)

    async def fake_score(diet, dishes):
        return [
            DishVerdict(choice="yes", confidence=0.95, duration_ms=300),
            DishVerdict(choice="no", confidence=0.9, duration_ms=300),
        ]

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake_fetch)
    monkeypatch.setattr(jev_client, "score_dishes", fake_score)

    resp = client.post("/score", json={"restaurant": "Lulla", "menu_url": "https://example.com/menu", "diet": "vegetarian"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["restaurant"] == "Lulla"
    assert body["score"] == 0.5  # 1 of 2 dishes qualifies
    assert body["confidence"] == pytest.approx((0.95 + 0.9) / 2)
    assert body["escalated"] is False
    assert body["before_escalation"] is None
    assert body["dishes"][0]["verdict"] == "yes"
    assert body["dishes"][1]["verdict"] == "no"
    assert body["jev_cost_usd"] is None
    assert len(body["evidence"]) == 1


def test_score_excludes_low_confidence_yes_from_score(client: TestClient, monkeypatch):
    dishes = [{"name": "Ambiguous Soup", "description": "broth", "evidence_ids": []}]

    async def fake_fetch(menu_url, restaurant):
        return _fake_fetch_result(dishes)

    async def fake_score(diet, dishes):
        return [DishVerdict(choice="yes", confidence=0.5, duration_ms=100)]

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake_fetch)
    monkeypatch.setattr(jev_client, "score_dishes", fake_score)

    resp = client.post("/score", json={"restaurant": "X", "menu_url": "https://example.com/m", "diet": "vegan"})
    body = resp.json()
    assert body["score"] == 0.0  # confidence 0.5 < YES_MIN_CONFIDENCE default 0.8
    assert body["dishes"][0]["verdict"] == "yes"  # verdict is shown literally, not rounded down


def test_score_with_no_dishes_returns_no_menu_evidence(client: TestClient, monkeypatch):
    async def fake_fetch(menu_url, restaurant):
        return _fake_fetch_result([])

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake_fetch)

    resp = client.post("/score", json={"restaurant": "X", "menu_url": "https://example.com/m", "diet": "vegan"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "NO_MENU_EVIDENCE"


def test_score_propagates_menu_fetch_failure(client: TestClient, monkeypatch):
    async def fake_fetch(menu_url, restaurant):
        raise MenuFetchError(502, "PROVIDER_FAILURE", "Browserbase is down.", retryable=True)

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake_fetch)

    resp = client.post("/score", json={"restaurant": "X", "menu_url": "https://example.com/m", "diet": "vegan"})
    assert resp.status_code == 502
    body = resp.json()
    assert body["error"]["code"] == "PROVIDER_FAILURE"
    assert body["error"]["retryable"] is True


def test_score_reports_jev_outage_as_provider_failure_not_a_guess(client: TestClient, monkeypatch):
    dishes = [{"name": "Mystery Dish", "description": "", "evidence_ids": []}]

    async def fake_fetch(menu_url, restaurant):
        return _fake_fetch_result(dishes)

    async def fake_score(diet, dishes):
        raise JevError("Jev is down")

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake_fetch)
    monkeypatch.setattr(jev_client, "score_dishes", fake_score)

    resp = client.post("/score", json={"restaurant": "X", "menu_url": "https://example.com/m", "diet": "vegan"})
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "PROVIDER_FAILURE"


def test_score_rejects_malformed_request_body(client: TestClient):
    resp = client.post("/score", json={"restaurant": "X"})  # missing menu_url, diet
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"


def test_score_truncates_and_warns_past_dish_cap(client: TestClient, monkeypatch):
    dishes = [{"name": f"Dish {i}", "description": "", "evidence_ids": []} for i in range(55)]

    async def fake_fetch(menu_url, restaurant):
        return _fake_fetch_result(dishes)

    async def fake_score(diet, dishes):
        assert len(dishes) == 50
        return [DishVerdict(choice="yes", confidence=0.9, duration_ms=50) for _ in dishes]

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake_fetch)
    monkeypatch.setattr(jev_client, "score_dishes", fake_score)

    resp = client.post("/score", json={"restaurant": "X", "menu_url": "https://example.com/m", "diet": "vegan"})
    body = resp.json()
    assert len(body["dishes"]) == 50
    assert any("50 dishes" in w for w in body["warnings"])
