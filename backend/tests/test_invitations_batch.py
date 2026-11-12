"""Bulk invitations in batches: event page (existing guests) and import page."""

import os

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL not set", allow_module_level=True)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from datetime import datetime, timedelta, timezone  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402
from app.auth import get_app_user  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import events as events_router  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def sent(monkeypatch):
    """Fake delivery: numbers ending in 9 fail."""
    calls = []

    def fake(event, recipient, invited_by):
        calls.append(recipient.phone)
        return not (recipient.phone or "").endswith("9")

    monkeypatch.setattr(events_router, "_send_invitation", fake)
    monkeypatch.setattr(events_router, "_notify_recipient_in_app", lambda *a, **k: None)
    return calls


def _setup(db, role=models.Role.admin):
    user = models.User(firebase_uid="uid-a", email="a@x.com", role=role, phone="972500000001", first_name="مدير")
    ev = models.Event(title="عرس", date=datetime.now(timezone.utc) + timedelta(days=9), venue_name="قاعة", created_by_uid="uid-a")
    db.add_all([user, ev])
    db.commit()
    app.dependency_overrides[get_app_user] = lambda: user
    return user, ev


def test_send_invitations_batch(db, sent):
    _, ev = _setup(db)
    a = models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name="أ", phone="0501111111")
    b = models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name="ب", phone="0501111119")
    c = models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name="ج")
    db.add_all([a, b, c])
    db.commit()
    try:
        with TestClient(app) as cl:
            r = cl.post(f"/api/events/{ev.id}/send-invitations-batch", json={"recipient_ids": [a.id, b.id, c.id, "nope"]})
            assert r.status_code == 200, r.text
            res = {x["recipient_id"]: x for x in r.json()["results"]}
            assert res[a.id]["success"] and not res[b.id]["success"] and not res[c.id]["success"]
            assert res["nope"]["error"] == "Recipient not found"
        db.refresh(a)
        assert a.sent_count == 1
        assert db.query(models.AuditLog).filter_by(action="event.send_invitations").one().meta == {"sent": 1, "failed": 3, "batch": True}
    finally:
        app.dependency_overrides.clear()


def test_import_invitations_batch(db, sent):
    _, ev = _setup(db)
    db.add(models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name="قديم", phone="0502222222"))
    db.commit()
    guests = [
        {"client_id": "1", "first_name": "سامي", "phone": "0503333333", "guests_count": 3, "side": "groom"},
        {"client_id": "2", "first_name": "قديم", "phone": "0502222222"},
        {"client_id": "3", "first_name": "فشل", "phone": "0504444449"},
        {"client_id": "4", "first_name": "بلا رقم"},
    ]
    try:
        with TestClient(app) as cl:
            r = cl.post(f"/api/events/{ev.id}/import-invitations-batch", json={"guests": guests})
            assert r.status_code == 200, r.text
            res = {x["client_id"]: x for x in r.json()["results"]}
        assert res["1"]["success"] and res["1"]["recipient_id"]
        assert res["2"]["success"] and res["2"]["already_invited"]
        assert not res["3"]["success"] and res["3"]["recipient_id"]  # added, not delivered
        assert not res["4"]["success"] and not res["4"]["recipient_id"]
        added = db.query(models.InvitationRecipient).filter_by(event_id=ev.id, phone="0503333333").one()
        assert added.guests_count == 3 and added.side == models.RecipientSide.groom and added.sent_count == 1
    finally:
        app.dependency_overrides.clear()


def test_batches_are_team_only(db, sent):
    _, ev = _setup(db, role=models.Role.user)
    try:
        with TestClient(app) as cl:
            assert cl.post(f"/api/events/{ev.id}/send-invitations-batch", json={"recipient_ids": ["x"]}).status_code == 403
            assert cl.post(f"/api/events/{ev.id}/import-invitations-batch", json={"guests": [{"client_id": "1", "phone": "0501"}]}).status_code == 403
    finally:
        app.dependency_overrides.clear()
