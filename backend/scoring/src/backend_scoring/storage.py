"""SQLite persistence.

`get_engine` is cached per process by design (SQLAlchemy engines pool
connections). Tests read a fresh `TRIP_DB_PATH` and call `get_engine.cache_clear()`
before use so each test run gets an isolated database file.
"""

import os
from functools import lru_cache

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine


@lru_cache
def get_engine():
    db_path = os.environ.get("TRIP_DB_PATH", "data/trips.db")
    directory = os.path.dirname(db_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    return create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})


# Columns added to tables after a trip file may already exist; create_all never adds columns.
_ADDED_COLUMNS = {"researchcandidate": {"source_verified": "BOOLEAN NOT NULL DEFAULT 1"}}


def init_db() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table, columns in _ADDED_COLUMNS.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def get_session():
    with Session(get_engine()) as session:
        yield session
