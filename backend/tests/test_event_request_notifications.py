"""DAW-49: a new event request notifies every active admin/manager."""

import os

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL not set", allow_module_level=True)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402
from app.auth import get_app_user  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import event_requests  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    yield session
    session.close()


def _user(db, uid, role, active=True):
    u = models.User(firebase_uid=uid, email=f"{uid}@x.com", role=role, is_active=active, first_name=uid)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_new_request_notifies_active_team(db, monkeypatch):
    pushes = []
    monkeypatch.setattr(event_requests, "send_push_to_user", lambda db, user, title, body, data=None: pushes.append((user.email, data)))
    _user(db, "admin", models.Role.admin)
    _user(db, "manager", models.Role.manager)
    _user(db, "gone", models.Role.admin, active=False)
    _user(db, "other", models.Role.user)
    requester = _user(db, "sami", models.Role.user)
    app.dependency_overrides[get_app_user] = lambda: requester
    try:
        with TestClient(app) as c:
            r = c.post("/api/event-requests", json={"title": "عرس", "details": "في الصيف", "requester_phone": "0501234567"})
            assert r.status_code == 201, r.text
        notes = db.query(models.Notification).all()
        assert sorted(n.target_user_email for n in notes) == ["admin@x.com", "manager@x.com"]
        assert all(n.link == "/event-requests" and "عرس" in n.message and not n.is_read for n in notes)
        assert sorted(pushes) == [("admin@x.com", {"path": "/event-requests"}), ("manager@x.com", {"path": "/event-requests"})]
        # The Notifications page gets the link.
        app.dependency_overrides[get_app_user] = lambda: db.query(models.User).filter_by(email="admin@x.com").one()
        with TestClient(app) as c:
            assert c.get("/api/notifications").json()[0]["link"] == "/event-requests"
    finally:
        app.dependency_overrides.clear()
