import pytest
from fastapi.testclient import TestClient

from backend_scoring.storage import get_engine


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRIP_DB_PATH", str(tmp_path / "trips.db"))
    get_engine.cache_clear()

    from backend_scoring.main import app

    with TestClient(app) as test_client:
        yield test_client

    get_engine.cache_clear()
