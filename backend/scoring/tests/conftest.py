import pytest
from fastapi.testclient import TestClient

from backend_scoring import menu_fetch_client
from backend_scoring.menu_fetch_client import MenuFetchError
from backend_scoring.storage import get_engine


@pytest.fixture(autouse=True)
def no_live_providers(monkeypatch):
    """Tests never reach Browserbase; a test that needs it installs a labeled fake."""

    async def unavailable(*args, **kwargs):
        raise MenuFetchError(503, "NOT_CONFIGURED", "Provider disabled in tests.", retryable=True)

    monkeypatch.setattr(menu_fetch_client, "fetch_menu", unavailable)
    monkeypatch.setattr(menu_fetch_client, "search_sources", unavailable)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRIP_DB_PATH", str(tmp_path / "trips.db"))
    get_engine.cache_clear()

    from backend_scoring.main import app

    with TestClient(app) as test_client:
        yield test_client

    get_engine.cache_clear()
