import urllib.error

from backend_scoring import jev


def test_missing_key_returns_explicit_unknown(client, monkeypatch):
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    resp = client.post("/jev/dish-fit", json={"dish": "Falafel wrap", "diet": "vegan"})
    assert resp.status_code == 502
    body = resp.json()
    assert body["status"] == "error"
    assert body["verdict"] == "unknown"
    assert body["confidence"] is None
    assert body["error"]["code"] == "jev_key_missing"


def test_jev_network_error_returns_explicit_unknown(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-not-real")

    def boom(*a, **k):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(jev.urllib.request, "urlopen", boom)
    result = jev.dish_fit("Falafel wrap", "", "vegan")
    assert result["status"] == "error"
    assert result["verdict"] == "unknown"
    assert result["error"]["code"] == "jev_unavailable"
