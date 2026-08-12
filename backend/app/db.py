"""Postgres (Cloud SQL) connection setup.

See BUSINESS_LOGIC.md for why Postgres over Firestore. `DATABASE_URL` is
read at import time:

- Local dev / Cloud SQL Auth Proxy on a TCP port:
  `postgresql+psycopg://user:password@127.0.0.1:5432/daawatey`
- Cloud Run connecting via the Auth Proxy's Unix socket sidecar/connector:
  `postgresql+psycopg://user:password@/daawatey?host=/cloudsql/INSTANCE_CONNECTION_NAME`

Nothing here is Cloud-Run-specific — it's a plain SQLAlchemy engine, so the
same code runs identically in local dev, CI, and Cloud Run; only the URL
differs, and that comes from a secret, never committed.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Deferred, not eager: importing app.db must not fail just because
# DATABASE_URL isn't set yet (e.g. /api/healthz doesn't need a database, and
# Alembic sets this env var itself before importing).
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionLocal = (
    sessionmaker(bind=engine, autoflush=False, autocommit=False) if engine else None
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a request-scoped session, always closed."""
    if SessionLocal is None:
        raise RuntimeError(
            "DATABASE_URL is not set — see BUSINESS_LOGIC.md for the connection "
            "string format."
        )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
