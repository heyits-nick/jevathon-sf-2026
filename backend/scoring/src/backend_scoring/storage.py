"""SQLite persistence.

`get_engine` is cached per process by design (SQLAlchemy engines pool
connections). Tests read a fresh `TRIP_DB_PATH` and call `get_engine.cache_clear()`
before use so each test run gets an isolated database file.
"""

import os
from functools import lru_cache

from sqlmodel import Session, SQLModel, create_engine


@lru_cache
def get_engine():
    db_path = os.environ.get("TRIP_DB_PATH", "data/trips.db")
    directory = os.path.dirname(db_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    return create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session
