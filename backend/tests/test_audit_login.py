"""DAW-51: a "user.login" audit row once per Firebase sign-in.

Needs TEST_DATABASE_URL, like test_seating_checkin.py.
"""

import os
import time

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL not set", allow_module_level=True)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from app import auth, models  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    auth._logins_seen.clear()
    session = SessionLocal()
    yield session
    session.close()


def _logins(db):
    return db.query(models.AuditLog).filter_by(action="user.login").all()


def test_login_logged_once_per_sign_in(db):
    now = int(time.time())
    first = auth.CurrentUser(uid="uid-1", email=None, auth_time=now - 5, sign_in_provider="custom")
    user = auth.get_app_user(first, db)  # brand-new account
    auth.get_app_user(first, db)  # more requests, same session
    auth._logins_seen.clear()  # another server instance
    auth.get_app_user(first, db)
    rows = _logins(db)
    assert len(rows) == 1
    assert rows[0].actor_user_id == user.id and rows[0].meta["method"] == "custom"

    # Signing in again (new auth_time) is a new login.
    auth.get_app_user(auth.CurrentUser(uid="uid-1", email=None, auth_time=now, sign_in_provider="phone"), db)
    assert len(_logins(db)) == 2


def test_old_session_is_not_a_login(db):
    # A session that was already open (e.g. when this was deployed).
    old = auth.CurrentUser(uid="uid-2", email=None, auth_time=int(time.time()) - 3600)
    auth.get_app_user(old, db)
    assert _logins(db) == []
