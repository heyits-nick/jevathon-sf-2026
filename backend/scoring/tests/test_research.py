"""Automatic link research and recall/alternative replies, end to end through
POST /trips/{id}/messages.

FAKE PROVIDERS: every Browserbase (menu_fetch_client) and Jev (jev_client)
response in this file is labeled sample data installed by the `world`
fixture. Nothing here is a live result; the live check is manual (see
docs/integration-runbook.md). The fakes answer from the question content
they receive, so the tests exercise the real pipeline code: caption
extraction, capability filtering, validation of Jev's choices, persistence,
and serialization.
"""

import asyncio
import uuid
from collections import Counter

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend_scoring import jev_client, menu_fetch_client
from backend_scoring.jev_client import ChoiceAnswer, JevError
from backend_scoring.models import ResearchCandidate, ResearchRun, Trip, TripMessage
from backend_scoring.storage import get_engine

POST_URL = "https://www.instagram.com/reel/SAMPLE123/"

# Sample (fake) public post page, shaped like the bridge's markdown raw_text.
SAMPLE_POST_PAGE = "\n".join(
    [
        "[![sample_brand](https://example.com/avatar.jpg)](https://www.instagram.com/sample_brand/)",
        "sample_brand",
        "Edited•3d",
        "Free tote bag giveaway today at 18 Church Street, come say hi!",
        "Load more comments",
        "some_commenter nice!",
    ]
)

# Sample (fake) Browserbase Search results.
SAMPLE_RESULTS = [
    {"id": "r1", "title": "Green Leaf Cafe Menu", "url": "https://greenleaf.example/menu", "snippet": "Veggie bowls $14"},
    {"id": "r2", "title": "Stone Grill Menu", "url": "https://stonegrill.example/menu", "snippet": "Steaks and salads"},
    {"id": "r3", "title": "Best lunch spots downtown", "url": "https://news.example/best-lunch", "snippet": "Our list"},
    {"id": "r4", "title": "Green Leaf Cafe PDF menu", "url": "https://greenleaf.example/menu.pdf", "snippet": "PDF"},
    {"id": "r5", "title": "Stone Grill delivery", "url": "https://www.doordash.com/store/stone-grill", "snippet": "Order"},
]

# Sample (fake) menus returned by the menu fetch bridge.
SAMPLE_MENUS = {
    "https://greenleaf.example/menu": [
        ("Veggie Bowl", "brown rice, roasted vegetables"),
        ("Tofu Curry", "tofu, coconut, vegetables"),
        ("Beef Burger", "beef patty, cheddar"),
    ],
    "https://stonegrill.example/menu": [
        ("Ribeye Steak", "12oz ribeye"),
        ("Garden Salad", "greens, tomato, cucumber"),
    ],
}
MEAT_WORDS = ("beef", "steak", "ribeye", "chicken")


def _answer(choice: str, confidence: float = 0.9, probabilities: dict | None = None) -> ChoiceAnswer:
    return ChoiceAnswer(choice=choice, confidence=confidence, duration_ms=40, probabilities=probabilities)


def _page(url: str, restaurant: str) -> dict:
    if url == POST_URL:
        return {"restaurant": "", "menu_url": url, "raw_text": SAMPLE_POST_PAGE, "dishes": [], "evidence": []}
    dishes, evidence = [], []
    for i, (name, description) in enumerate(SAMPLE_MENUS[url], start=1):
        evidence.append(
            {"id": f"e{i}", "url": url, "quote": f"{name} {description}", "kind": "menu", "checked_at": "2026-09-26T12:00:00Z"}
        )
        dishes.append({"name": name, "description": description, "evidence_ids": [f"e{i}"]})
    return {"restaurant": restaurant, "menu_url": url, "raw_text": "sample", "dishes": dishes, "evidence": evidence}


class FakeWorld:
    """Labeled fake providers. `calls` counts every provider call; flags
    switch individual Jev decisions to unclear/outage."""

    def __init__(self) -> None:
        self.calls: Counter = Counter()
        self.place_unclear = False
        self.jev_down = False
        self.searched_urls: list[str] = []

    def _jev(self, name: str) -> None:
        self.calls[name] += 1
        if self.jev_down:
            raise JevError("Sample outage: Jev unavailable.")

    # --- Browserbase bridge fakes ---
    async def fetch_menu(self, url, restaurant, timeout=None):
        self.calls["fetch_menu"] += 1
        return _page(url, restaurant)

    async def search_sources(self, query, limit=5, timeout=None):
        self.calls["search_sources"] += 1
        return {"query": query, "results": SAMPLE_RESULTS[:limit]}

    # --- Jev fakes ---
    async def resolve_place(self, caption, candidates, timeout):
        self._jev("resolve_place")
        assert "Load more comments" not in caption and "some_commenter" not in caption
        if self.place_unclear:
            return _answer("unclear", 0.7), {i: _answer("unclear", 0.6) for i in range(len(candidates))}
        return _answer("yes"), {i: _answer("yes" if c == "18 Church Street" else "no") for i, c in enumerate(candidates)}

    async def select_sources(self, place, diet, results, timeout):
        self._jev("select_sources")
        self.searched_urls = [r["url"] for r in results]
        return {i: (_answer("yes" if r["url"].endswith("/menu") else "no"), None) for i, r in enumerate(results)}

    async def score_dishes(self, diet, dishes, timeout=None):
        self._jev("score_dishes")
        text = lambda d: f"{d['name']} {d.get('description', '')}".lower()  # noqa: E731
        return [_answer("no" if any(w in text(d) for w in MEAT_WORDS) else "yes") for d in dishes]

    async def choose_recommendation(self, place, preferences, summaries, timeout):
        self._jev("choose_recommendation")
        keys = sorted(summaries, key=lambda k: not summaries[k].startswith("Green Leaf"))
        return _answer(keys[0], 0.85, {k: (0.85 if k == keys[0] else 0.15) for k in keys})

    async def classify_intent(self, text, context, timeout):
        self._jev("classify_intent")
        lowered = text.lower()
        if "don't like" in lowered or "another" in lowered:
            return _answer("alternative")
        if "?" in lowered:
            return _answer("recall")
        return _answer("other")

    async def choose_recall(self, text, summaries, timeout):
        self._jev("choose_recall")
        if "open" in text.lower():  # hours are not in menu research
            return _answer("none", 0.9)
        return _answer("all", 0.9)

    async def choose_rejected(self, text, labels, timeout):
        self._jev("choose_rejected")
        return _answer(next(k for k, label in labels.items() if "currently recommended" in label), 0.9)

    async def confirm_preference_candidates(self, text, candidates):
        self._jev("confirm_preference_candidates")
        return {field: _answer("yes", 0.95) for field in candidates}


@pytest.fixture()
def world(monkeypatch) -> FakeWorld:
    fake = FakeWorld()
    monkeypatch.setattr(menu_fetch_client, "fetch_menu", fake.fetch_menu)
    monkeypatch.setattr(menu_fetch_client, "search_sources", fake.search_sources)
    for name in (
        "resolve_place",
        "select_sources",
        "score_dishes",
        "choose_recommendation",
        "classify_intent",
        "choose_recall",
        "choose_rejected",
        "confirm_preference_candidates",
    ):
        monkeypatch.setattr(jev_client, name, getattr(fake, name))
    return fake


def _create_trip(client: TestClient, **preferences) -> tuple[str, str]:
    resp = client.post("/trips", json={"destination": "New York", "preferences": preferences})
    assert resp.status_code == 201
    body = resp.json()
    return body["trip_id"], body["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _send(client: TestClient, trip_id: str, token: str, message_id: str | None = None, **body):
    body["client_message_id"] = message_id or str(uuid.uuid4())
    return client.post(f"/trips/{trip_id}/messages", headers=_auth(token), json=body)


def _researched_trip(client: TestClient) -> tuple[str, str, dict]:
    trip_id, token = _create_trip(client, diet="vegetarian")
    resp = _send(client, trip_id, token, source_url=POST_URL)
    assert resp.status_code == 200
    return trip_id, token, resp.json()


def _by_name(trip: dict) -> dict[str, dict]:
    return {c["restaurant"]: c for c in trip["candidates"]}


def test_shared_link_is_researched_to_ready_and_persisted(client: TestClient, world: FakeWorld):
    trip_id, token, body = _researched_trip(client)
    trip = body["trip"]

    assert trip["status"] == "ready"
    assert trip["saves"][0]["source_url"] == POST_URL
    assert trip["saves"][0]["place_name"] == "18 Church Street"

    # Capability filter: the PDF and the JS delivery app never reach Jev.
    assert "https://greenleaf.example/menu.pdf" not in world.searched_urls
    assert not any("doordash" in url for url in world.searched_urls)
    assert "https://news.example/best-lunch" in world.searched_urls  # Jev said no to it, not code

    candidates = _by_name(trip)
    assert set(candidates) == {"Green Leaf Cafe", "Stone Grill"}
    green = candidates["Green Leaf Cafe"]
    assert trip["recommended_candidate_ids"] == [green["id"]]
    assert trip["candidates"][0]["id"] == green["id"]  # recommendation serialized first
    assert "Jev's pick" in green["recommendation_reason"]
    assert [d["verdict"] for d in green["score_result"]["dishes"]] == ["yes", "yes", "no"]
    # Evidence IDs are namespaced per candidate and dishes point at them.
    evidence_ids = {e["id"] for e in green["evidence"]}
    assert all(eid in evidence_ids for d in green["score_result"]["dishes"] for eid in d["evidence_ids"])
    assert not evidence_ids & {e["id"] for e in candidates["Stone Grill"]["evidence"]}

    stages = Counter(d["stage"] for d in trip["decisions"])
    assert stages["place:single_location"] == 1
    assert stages["source_selection"] == 3  # one per readable search result
    assert stages["dish_scoring"] == 2
    assert stages["recommendation"] == 1
    assert "Green Leaf Cafe" in body["reply"] and "18 Church Street" in body["reply"]

    # Everything survives a fresh read (a dashboard refresh).
    reread = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert reread["status"] == "ready"
    assert reread["recommended_candidate_ids"] == [green["id"]]
    assert {c["id"] for c in reread["candidates"]} == {c["id"] for c in trip["candidates"]}
    assert len(reread["decisions"]) == len(trip["decisions"])
    assert [m["role"] for m in reread["messages"]] == ["user", "assistant"]


def test_batched_jev_calls_count_their_time_once(client: TestClient, world: FakeWorld, monkeypatch):
    async def select_sources_with_names(place, diet, results, timeout):
        # As if each menu title had several segments, so Jev also picks a name.
        selections = await world.select_sources(place, diet, results, timeout)
        return {i: (is_menu, _answer("s0") if is_menu.choice == "yes" else None) for i, (is_menu, _) in selections.items()}

    monkeypatch.setattr(jev_client, "select_sources", select_sources_with_names)
    _, _, body = _researched_trip(client)
    decisions = body["trip"]["decisions"]
    # Each batched call (place resolution, source selection) answered several
    # questions in one 40 ms fake call; summing its rows must give 40, not 40×N.
    for stages in ({"place:single_location", "place:candidate"}, {"source_selection", "restaurant_name"}):
        durations = [d["duration_ms"] for d in decisions if d["stage"] in stages]
        assert len(durations) > 1 and any(d["stage"] == "restaurant_name" for d in decisions)
        assert sorted(durations) == [0] * (len(durations) - 1) + [40]


def test_duplicate_message_makes_no_provider_calls(client: TestClient, world: FakeWorld):
    trip_id, token = _create_trip(client, diet="vegetarian")
    message_id = str(uuid.uuid4())
    first = _send(client, trip_id, token, message_id, source_url=POST_URL)
    assert first.status_code == 200
    calls_after_first = dict(world.calls)

    replay = _send(client, trip_id, token, message_id, source_url=POST_URL)
    assert replay.status_code == 200
    assert replay.json()["reply"] == first.json()["reply"]
    assert dict(world.calls) == calls_after_first
    assert len(replay.json()["trip"]["saves"]) == 1

    conflict = _send(client, trip_id, token, message_id, source_url="https://www.instagram.com/reel/OTHER/")
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert dict(world.calls) == calls_after_first


def test_text_message_is_committed_before_jev_is_asked(client: TestClient, world: FakeWorld, monkeypatch):
    trip_id, token, _ = _researched_trip(client)
    message_id = str(uuid.uuid4())
    visible_to_a_duplicate = []

    async def classify_intent(text, context, timeout):
        # A duplicate delivery runs its idempotency check in its own session.
        with Session(get_engine()) as other:
            query = select(TripMessage).where(TripMessage.client_message_id == message_id)
            visible_to_a_duplicate.append(other.exec(query).first() is not None)
        return await world.classify_intent(text, context, timeout)

    monkeypatch.setattr(jev_client, "classify_intent", classify_intent)
    assert _send(client, trip_id, token, message_id, text="What did you find?").status_code == 200
    assert visible_to_a_duplicate == [True]


@pytest.mark.parametrize("researched", [True, False], ids=["conversation", "preferences"])
def test_jev_outage_on_a_text_message_lets_its_retry_through(client: TestClient, world: FakeWorld, researched: bool):
    if researched:
        trip_id, token, _ = _researched_trip(client)
    else:
        trip_id, token = _create_trip(client)
    message_id = str(uuid.uuid4())
    text = "What did you find?" if researched else "vegan please"

    world.jev_down = True
    failed = _send(client, trip_id, token, message_id, text=text)
    assert failed.status_code == 502
    assert failed.json()["error"]["code"] == "PROVIDER_FAILURE"

    world.jev_down = False
    retry = _send(client, trip_id, token, message_id, text=text)
    assert retry.status_code == 200
    assert "Still working" not in retry.json()["reply"]
    user_messages = [m for m in retry.json()["trip"]["messages"] if m["role"] == "user"]
    assert [m["text"] for m in user_messages].count(text) == 1


def test_unclear_place_asks_for_clarification_and_keeps_the_save(client: TestClient, world: FakeWorld):
    world.place_unclear = True
    trip_id, token = _create_trip(client, diet="vegetarian")
    resp = _send(client, trip_id, token, source_url=POST_URL)

    assert resp.status_code == 200
    trip = resp.json()["trip"]
    assert trip["status"] == "needs_clarification"
    assert trip["clarification"] and "Which place" in trip["clarification"]
    assert len(trip["saves"]) == 1 and trip["saves"][0]["place_name"] is None
    assert trip["candidates"] == []
    assert world.calls["search_sources"] == 0
    assert world.calls["select_sources"] == 0
    assert any(d["stage"] == "place:single_location" and d["choice"] == "unclear" for d in trip["decisions"])


def test_jev_outage_fails_visibly_and_keeps_the_save(client: TestClient, world: FakeWorld):
    world.jev_down = True
    trip_id, token = _create_trip(client, diet="vegetarian")
    resp = _send(client, trip_id, token, source_url=POST_URL)

    assert resp.status_code == 200
    body = resp.json()
    assert body["trip"]["status"] == "failed"
    assert "Jev" in body["reply"] and "unavailable" in body["reply"]
    assert len(body["trip"]["saves"]) == 1
    assert body["trip"]["candidates"] == [] and body["trip"]["decisions"] == []
    assert world.calls["search_sources"] == 0

    reread = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert reread["status"] == "failed" and len(reread["saves"]) == 1


def test_missing_diet_asks_then_a_diet_reply_resumes_research(client: TestClient, world: FakeWorld):
    trip_id, token = _create_trip(client)
    first = _send(client, trip_id, token, source_url=POST_URL)
    trip = first.json()["trip"]
    assert trip["status"] == "needs_clarification"
    assert "18 Church Street" in trip["clarification"] and "dietary" in trip["clarification"]
    assert world.calls["search_sources"] == 0

    resumed = _send(client, trip_id, token, text="vegetarian please")
    assert resumed.status_code == 200
    trip = resumed.json()["trip"]
    assert trip["preferences"]["diet"] == "vegetarian"
    assert trip["status"] == "ready"
    assert trip["clarification"] is None
    assert len(trip["recommended_candidate_ids"]) == 1
    assert world.calls["resolve_place"] == 1  # the place was not re-resolved
    assert "Updated your preferences" in resumed.json()["reply"]


def test_a_newer_link_retires_a_run_waiting_for_a_diet(client: TestClient, world: FakeWorld):
    trip_id, token = _create_trip(client)
    waiting = _send(client, trip_id, token, source_url=POST_URL)
    assert waiting.json()["trip"]["status"] == "needs_clarification"

    # The diet arrives with a second share instead of as a reply.
    second = _send(client, trip_id, token, source_url=POST_URL, text="vegetarian please")
    assert second.json()["trip"]["status"] == "ready"
    recommended = second.json()["trip"]["recommended_candidate_ids"]
    searches = world.calls["search_sources"]

    recall = _send(client, trip_id, token, text="What did you find?")
    assert recall.status_code == 200
    assert world.calls["search_sources"] == searches  # the stale run was not resumed
    assert recall.json()["trip"]["recommended_candidate_ids"] == recommended
    with Session(get_engine()) as session:
        runs = session.exec(select(ResearchRun).where(ResearchRun.trip_id == trip_id)).all()
        assert sorted(r.status for r in runs) == ["ready", "superseded"]


def test_only_the_message_supplying_the_diet_resumes_a_waiting_run(client: TestClient, world: FakeWorld):
    trip_id, token, body = _researched_trip(client)
    # A waiting run left behind by a trip file from before stale runs were retired.
    with Session(get_engine()) as session:
        session.add(
            ResearchRun(trip_id=trip_id, save_id=body["trip"]["saves"][0]["id"], status="needs_diet", place="18 Church Street")
        )
        session.commit()
    searches = world.calls["search_sources"]

    resp = _send(client, trip_id, token, text="What did you find?")
    assert resp.status_code == 200
    assert world.calls["search_sources"] == searches


@pytest.mark.parametrize(
    ("held", "outcome"),
    [
        ("resolve_place", "proceeds"),
        ("resolve_place", "unclear"),
        ("select_sources", "fails"),
        ("score_dishes", "proceeds"),
        ("choose_recommendation", "proceeds"),
    ],
)
def test_a_newer_link_wins_over_older_research_still_running(
    client: TestClient, world: FakeWorld, monkeypatch, held: str, outcome: str
):
    """Two links on one trip, in one event loop: the older request's first
    `held` Jev call waits until the newer link's research has finished."""
    from backend_scoring.main import app

    trip_id, token = _create_trip(client, diet="vegetarian")
    reached, release = asyncio.Event(), asyncio.Event()
    original = getattr(jev_client, held)
    calls = 0

    async def hold_first_call(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            reached.set()
            await release.wait()
            if outcome == "fails":
                raise JevError("Sample outage after the newer link finished.")
            world.place_unclear = outcome == "unclear"
        return await original(*args, **kwargs)

    monkeypatch.setattr(jev_client, held, hold_first_call)

    async def older_then_newer():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:

            def share_link():
                body = {"client_message_id": str(uuid.uuid4()), "source_url": POST_URL}
                return http.post(f"/trips/{trip_id}/messages", headers=_auth(token), json=body)

            older = asyncio.create_task(share_link())
            await reached.wait()
            newer = await share_link()
            release.set()
            return await older, newer

    older, newer = asyncio.run(older_then_newer())
    assert older.status_code == 200 and newer.status_code == 200
    assert newer.json()["trip"]["status"] == "ready"
    if outcome != "fails":
        assert "newer link" in older.json()["reply"]

    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert trip["status"] == "ready" and trip["clarification"] is None
    assert trip["recommended_candidate_ids"] == newer.json()["trip"]["recommended_candidate_ids"]
    with Session(get_engine()) as session:
        runs = session.exec(
            select(ResearchRun).where(ResearchRun.trip_id == trip_id).order_by(ResearchRun.created_at)
        ).all()
        assert [r.status for r in runs] == ["failed" if outcome == "fails" else "superseded", "ready"]


def test_an_older_links_preference_outage_leaves_a_newer_links_status(
    client: TestClient, world: FakeWorld, monkeypatch
):
    """The older link's text waits on Jev while a newer link finishes; the
    older Jev outage must not mark the trip failed."""
    from backend_scoring.main import app

    trip_id, token = _create_trip(client, diet="vegetarian")
    reached, release = asyncio.Event(), asyncio.Event()

    async def fail_after_newer(text, candidates):
        reached.set()
        await release.wait()
        raise JevError("Sample outage after the newer link finished.")

    monkeypatch.setattr(jev_client, "confirm_preference_candidates", fail_after_newer)

    async def older_then_newer():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:

            def share_link(**extra):
                body = {"client_message_id": str(uuid.uuid4()), "source_url": POST_URL, **extra}
                return http.post(f"/trips/{trip_id}/messages", headers=_auth(token), json=body)

            older = asyncio.create_task(share_link(text="I'm vegetarian and want something cheap"))
            await reached.wait()
            newer = await share_link()
            release.set()
            return await older, newer

    older, newer = asyncio.run(older_then_newer())
    assert older.status_code == 200 and "unavailable" in older.json()["reply"]
    assert newer.json()["trip"]["status"] == "ready"
    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert trip["status"] == "ready"
    assert trip["recommended_candidate_ids"] == newer.json()["trip"]["recommended_candidate_ids"]


def test_recall_answers_from_saved_research(client: TestClient, world: FakeWorld):
    trip_id, token, _ = _researched_trip(client)
    searches = world.calls["search_sources"]

    resp = _send(client, trip_id, token, text="What did you find for me?")
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    assert "Green Leaf Cafe (current recommendation)" in reply
    assert "Stone Grill" in reply and "https://greenleaf.example/menu" in reply
    assert world.calls["search_sources"] == searches  # recall never re-researches
    stages = [d["stage"] for d in resp.json()["trip"]["decisions"]]
    assert "intent" in stages and "recall" in stages


def test_recall_says_none_when_research_cannot_answer(client: TestClient, world: FakeWorld):
    trip_id, token, _ = _researched_trip(client)
    resp = _send(client, trip_id, token, text="Is Green Leaf open late?")
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    assert reply.startswith("My saved research doesn't answer that.")
    assert "Green Leaf Cafe" in reply and "Stone Grill" in reply


def test_alternative_sets_aside_the_recommendation(client: TestClient, world: FakeWorld):
    trip_id, token, body = _researched_trip(client)
    ids = {name: c["id"] for name, c in _by_name(body["trip"]).items()}

    resp = _send(client, trip_id, token, text="I don't like that one")
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    assert reply.startswith("Okay, setting aside Green Leaf Cafe.")
    assert "Stone Grill" in reply and "https://stonegrill.example/menu" in reply

    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert trip["recommended_candidate_ids"] == [ids["Stone Grill"]]
    assert "set this one aside" in _by_name(trip)["Green Leaf Cafe"]["recommendation_reason"]
    stages = [d["stage"] for d in trip["decisions"]]
    assert "rejected_candidate" in stages and "alternative" in stages

    # Setting aside the last eligible one says so instead of inventing a pick.
    resp = _send(client, trip_id, token, text="I don't like that one either")
    assert "None of the other researched menus" in resp.json()["reply"]
    assert client.get(f"/trips/{trip_id}", headers=_auth(token)).json()["recommended_candidate_ids"] == []


def test_selected_candidate_must_belong_to_the_trip(client: TestClient, world: FakeWorld):
    trip_id, token, body = _researched_trip(client)
    other_trip_id, other_token, other_body = _researched_trip(client)
    own_id = body["trip"]["candidates"][1]["id"]

    resp = _send(client, trip_id, token, selected_candidate_id=own_id)
    assert resp.status_code == 200
    assert resp.json()["trip"]["selected_candidate_id"] == own_id
    assert resp.json()["reply"].startswith("Saved your choice:")

    for bad_id in (str(uuid.uuid4()), other_body["trip"]["candidates"][0]["id"]):
        resp = _send(client, trip_id, token, selected_candidate_id=bad_id)
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "UNKNOWN_CANDIDATE"
    assert client.get(f"/trips/{trip_id}", headers=_auth(token)).json()["selected_candidate_id"] == own_id


def test_messages_require_the_trip_token(client: TestClient, world: FakeWorld):
    trip_id, _ = _create_trip(client, diet="vegetarian")
    _, other_token = _create_trip(client)
    body = {"client_message_id": str(uuid.uuid4()), "source_url": POST_URL}

    assert client.post(f"/trips/{trip_id}/messages", json=body).status_code == 401
    resp = client.post(f"/trips/{trip_id}/messages", headers=_auth(other_token), json=body)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"
    assert sum(world.calls.values()) == 0


def test_recall_labels_saved_verdicts_with_the_diet_they_were_scored_for(client: TestClient, world: FakeWorld):
    trip_id, token, _ = _researched_trip(client)
    with Session(get_engine()) as session:
        trip = session.get(Trip, trip_id)
        trip.diet = "vegan"  # changed after the vegetarian research, without re-research
        session.add(trip)
        session.commit()

    reply = _send(client, trip_id, token, text="What did you find for me?").json()["reply"]
    assert "vegetarian-compatible" in reply and "vegan-compatible" not in reply
    assert "checked for vegetarian, not vegan" in reply

    alternative = _send(client, trip_id, token, text="I don't like Green Leaf, show me another").json()["reply"]
    assert "vegan-compatible" not in alternative and "checked for vegetarian, not vegan" in alternative


def test_a_text_naming_the_place_answers_a_waiting_place_question(client: TestClient, world: FakeWorld):
    trip_id, token = _create_trip(client, diet="vegetarian")
    world.place_unclear = True
    asked = _send(client, trip_id, token, source_url=POST_URL).json()
    assert asked["trip"]["status"] == "needs_clarification"

    world.place_unclear = False
    resp = _send(client, trip_id, token, text="It's the one at 18 Church Street")
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"].startswith("Got it: 18 Church Street.")
    assert body["trip"]["status"] == "ready" and body["trip"]["recommended_candidate_ids"]


def test_a_preference_update_keeps_a_waiting_place_question(client: TestClient, world: FakeWorld):
    trip_id, token = _create_trip(client)
    world.place_unclear = True
    _send(client, trip_id, token, source_url=POST_URL)

    body = _send(client, trip_id, token, text="I'm vegan").json()
    assert body["trip"]["preferences"]["diet"] == "vegan"
    assert body["trip"]["status"] == "needs_clarification"
    assert "Which place should I research" in body["trip"]["clarification"]
    assert world.calls["resolve_place"] == 1  # "I'm vegan" names no place, so no place decision was asked


def test_low_confidence_source_and_name_answers_are_not_used(client: TestClient, world: FakeWorld, monkeypatch):
    async def unsure_sources(place, diet, results, timeout):
        world.calls["select_sources"] += 1
        answers = {}
        for i, r in enumerate(results):
            if r["url"] == "https://stonegrill.example/menu":
                answers[i] = (_answer("yes", 0.4), None)  # unsure it's a menu
            elif r["url"] == "https://greenleaf.example/menu":
                answers[i] = (_answer("yes"), _answer("s1", 0.3))  # unsure which segment is the name
            else:
                answers[i] = (_answer("no"), None)
        return answers

    monkeypatch.setattr(jev_client, "select_sources", unsure_sources)
    monkeypatch.setitem(SAMPLE_RESULTS[0], "title", "Green Leaf Cafe | Downtown Eats")
    names = set(_by_name(_researched_trip(client)[2]["trip"]))
    assert names == {"Green Leaf Cafe | Downtown Eats"}


def test_a_slow_preference_check_is_cut_off_inside_the_request_budget(client: TestClient, world: FakeWorld, monkeypatch):
    from backend_scoring import main

    async def slow_confirm(text, candidates):
        await asyncio.sleep(5)

    monkeypatch.setattr(main, "PREFERENCE_JEV_TIMEOUT_SECONDS", 1.0)
    monkeypatch.setattr(jev_client, "confirm_preference_candidates", slow_confirm)
    trip_id, token = _create_trip(client)
    resp = _send(client, trip_id, token, source_url=POST_URL, text="I'm vegan")
    assert resp.status_code == 200
    assert "Jev (our decision service) was unavailable" in resp.json()["reply"]
    assert world.calls["resolve_place"] == 0


def test_an_alternative_yields_to_a_newer_links_recommendation(client: TestClient, world: FakeWorld, monkeypatch):
    """While Jev chooses the alternative, a newer link's research commits its
    own recommendation; the older research must not add a second one."""
    trip_id, token, body = _researched_trip(client)
    save_id = body["trip"]["saves"][0]["id"]
    original = jev_client.choose_recommendation
    newer_id = str(uuid.uuid4())

    async def newer_link_finishes_first(*args, **kwargs):
        with Session(get_engine()) as session:
            newer = ResearchRun(trip_id=trip_id, save_id=save_id, status="ready", place="Sample newer place")
            session.add(newer)
            session.add(
                ResearchCandidate(id=newer_id, trip_id=trip_id, run_id=newer.id, restaurant="Newer Sample", menu_url="", rank=0)
            )
            session.commit()
        return await original(*args, **kwargs)

    monkeypatch.setattr(jev_client, "choose_recommendation", newer_link_finishes_first)
    resp = _send(client, trip_id, token, text="I don't like Green Leaf, show me another")
    assert resp.status_code == 200
    assert "newer link" in resp.json()["reply"]
    trip = resp.json()["trip"]
    assert trip["recommended_candidate_ids"] == [newer_id]
    assert _by_name(trip)["Green Leaf Cafe"]["recommendation_reason"].startswith("You set this one aside")
