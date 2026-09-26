import uuid

from fastapi.testclient import TestClient


def _create_trip(client: TestClient, **preferences) -> tuple[str, str]:
    resp = client.post("/trips", json={"destination": "Kyoto", "preferences": preferences})
    assert resp.status_code == 201
    body = resp.json()
    return body["trip_id"], body["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_create_and_read_trip(client: TestClient):
    trip_id, token = _create_trip(client, diet="vegetarian")

    resp = client.get(f"/trips/{trip_id}", headers=_auth(token))
    assert resp.status_code == 200
    trip = resp.json()
    assert trip["id"] == trip_id
    assert trip["destination"] == "Kyoto"
    assert trip["preferences"]["diet"] == "vegetarian"
    assert trip["saves"] == []
    assert trip["status"] == "saved"


def test_read_trip_requires_matching_token(client: TestClient):
    trip_id, _ = _create_trip(client)
    other_trip_id, other_token = _create_trip(client)

    resp = client.get(f"/trips/{trip_id}", headers=_auth(other_token))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"

    resp = client.get(f"/trips/{trip_id}")
    assert resp.status_code == 401


def test_message_with_source_url_creates_a_saved_post(client: TestClient):
    trip_id, token = _create_trip(client)
    message_id = str(uuid.uuid4())

    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={
            "client_message_id": message_id,
            "text": "vegetarian lunch nearby",
            "source_url": "https://example.com/shared-post",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["trip"]["saves"]) == 1
    save = body["trip"]["saves"][0]
    assert save["source_url"] == "https://example.com/shared-post"
    assert save["note"] == "vegetarian lunch nearby"
    assert body["reply"]


def test_text_only_message_does_not_create_a_saved_post(client: TestClient):
    trip_id, token = _create_trip(client)

    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "text": "Make this vegan and under $25"},
    )
    assert resp.status_code == 200
    assert resp.json()["trip"]["saves"] == []


def test_empty_message_is_rejected(client: TestClient):
    trip_id, token = _create_trip(client)

    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "EMPTY_MESSAGE"


def test_replaying_the_same_client_message_id_does_not_duplicate_saves(client: TestClient):
    trip_id, token = _create_trip(client)
    message_id = str(uuid.uuid4())
    payload = {
        "client_message_id": message_id,
        "text": "save this",
        "source_url": "https://example.com/a",
    }

    first = client.post(f"/trips/{trip_id}/messages", headers=_auth(token), json=payload)
    second = client.post(f"/trips/{trip_id}/messages", headers=_auth(token), json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()

    trip = client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
    assert len(trip["saves"]) == 1
    assert len(trip["messages"]) == 2  # one user turn + one assistant reply


def test_reusing_a_client_message_id_with_different_content_conflicts(client: TestClient):
    trip_id, token = _create_trip(client)
    message_id = str(uuid.uuid4())

    client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": message_id, "source_url": "https://example.com/a"},
    )
    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": message_id, "source_url": "https://example.com/b"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_selecting_an_unknown_candidate_is_rejected(client: TestClient):
    trip_id, token = _create_trip(client)

    resp = client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "selected_candidate_id": "does-not-exist"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "UNKNOWN_CANDIDATE"


def test_trip_survives_a_process_restart(client: TestClient, tmp_path):
    """The DB is a real file, not an in-memory map — reopening the engine
    against the same path must see previously committed data."""
    trip_id, token = _create_trip(client)
    client.post(
        f"/trips/{trip_id}/messages",
        headers=_auth(token),
        json={"client_message_id": str(uuid.uuid4()), "source_url": "https://example.com/a"},
    )

    from backend_scoring.storage import get_engine

    get_engine.cache_clear()  # simulate a fresh process re-reading the same TRIP_DB_PATH

    from backend_scoring.main import app as reloaded_app
    from fastapi.testclient import TestClient as _TestClient

    with _TestClient(reloaded_app) as reloaded_client:
        trip = reloaded_client.get(f"/trips/{trip_id}", headers=_auth(token)).json()
        assert len(trip["saves"]) == 1
