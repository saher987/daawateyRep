"""The saved import list: rows kept per event until invited."""

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
def delivery(monkeypatch):
    """Fake delivery: numbers ending in 9 fail. Records in-app notifications."""
    notified = []
    monkeypatch.setattr(events_router, "_send_invitation", lambda e, r, invited_by: not (r.phone or "").endswith("9"))
    monkeypatch.setattr(events_router, "_notify_recipient_in_app", lambda db, r, **k: notified.append(r.phone))
    return notified


def _setup(db, role=models.Role.admin):
    user = models.User(firebase_uid="uid-a", email="a@x.com", role=role, phone="972500000001", first_name="مدير")
    ev = models.Event(title="عرس", date=datetime.now(timezone.utc) + timedelta(days=9), venue_name="قاعة", created_by_uid="uid-a")
    db.add_all([user, ev])
    db.commit()
    app.dependency_overrides[get_app_user] = lambda: user
    return ev


def test_save_skips_duplicates_and_persists(db, delivery):
    ev = _setup(db)
    db.add(models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name="ضيف", phone="972502222222"))
    db.commit()
    guests = [
        {"first_name": "سامي", "phone": "0503333333", "guests_count": 3, "side": "groom", "group_label": "عمل"},
        {"first_name": "مكرر", "phone": "050-3333333"},  # same number again in the file
        {"first_name": "مدعو", "phone": "0502222222"},  # already a guest of the event
        {"first_name": "بلا رقم"},
        {"first_name": "بلا رقم ٢"},
        {},  # empty row
    ]
    try:
        with TestClient(app) as c:
            r = c.post(f"/api/events/{ev.id}/imported-invitees", json={"guests": guests}).json()
            assert (r["added"], r["skipped"]) == (3, 2)
            again = c.post(f"/api/events/{ev.id}/imported-invitees", json={"guests": guests[:1]}).json()
            assert (again["added"], again["skipped"]) == (0, 1)
            rows = c.get(f"/api/events/{ev.id}/imported-invitees").json()
            assert [x["first_name"] for x in rows] == ["سامي", "بلا رقم", "بلا رقم ٢"]
            assert rows[0]["side"] == "groom" and rows[0]["guests_count"] == 3
            # Nothing reached the guest list.
            assert db.query(models.InvitationRecipient).filter_by(event_id=ev.id).count() == 1

            # Edit: complete the missing phone; a phone another row has is refused.
            no_phone = rows[1]
            assert c.put(f"/api/imported-invitees/{no_phone['id']}", json={**no_phone, "phone": "0503333333"}).status_code == 409
            assert c.put(f"/api/imported-invitees/{no_phone['id']}", json={**no_phone, "phone": "0504444444"}).json()["phone"] == "0504444444"
            assert c.delete(f"/api/imported-invitees/{rows[2]['id']}").status_code == 204
            assert len(c.get(f"/api/events/{ev.id}/imported-invitees").json()) == 2
    finally:
        app.dependency_overrides.clear()


def test_send_moves_delivered_rows_and_keeps_failed(db, delivery):
    ev = _setup(db)
    guests = [
        {"first_name": "ينجح", "phone": "0503333333", "guests_count": 2, "town": "nazareth"},
        {"first_name": "يفشل", "phone": "0504444449"},
        {"first_name": "بلا رقم"},
        {"first_name": "صار ضيفاً", "phone": "0505555555"},
    ]
    try:
        with TestClient(app) as c:
            rows = c.post(f"/api/events/{ev.id}/imported-invitees", json={"guests": guests}).json()["rows"]
            ids = {x["first_name"]: x["id"] for x in rows}
            # Someone adds that last number to the event meanwhile.
            db.add(models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name="ضيف", phone="0505555555"))
            db.commit()
            res = {x["id"]: x for x in c.post(f"/api/events/{ev.id}/imported-invitees/send", json={"ids": list(ids.values())}).json()["results"]}
            assert res[ids["ينجح"]]["success"] and res[ids["ينجح"]]["recipient_id"]
            assert not res[ids["يفشل"]]["success"] and res[ids["يفشل"]]["error"] == "not_delivered"
            assert res[ids["بلا رقم"]]["error"] == "no_phone"
            assert res[ids["صار ضيفاً"]]["success"] and res[ids["صار ضيفاً"]]["already_invited"]
            left = c.get(f"/api/events/{ev.id}/imported-invitees").json()
            assert {x["first_name"]: x["last_error"] for x in left} == {"يفشل": "not_delivered", "بلا رقم": "no_phone"}
        db.expire_all()
        guest = db.query(models.InvitationRecipient).filter_by(event_id=ev.id, phone="0503333333").one()
        assert guest.sent_count == 1 and guest.guests_count == 2 and guest.town == "nazareth"
        # The undelivered one is not a guest, and was never told they were invited.
        assert db.query(models.InvitationRecipient).filter_by(event_id=ev.id, phone="0504444449").count() == 0
        assert delivery == ["0503333333"]
    finally:
        app.dependency_overrides.clear()


def test_team_only_and_event_delete_cleans_up(db, delivery):
    ev = _setup(db, role=models.Role.user)
    try:
        with TestClient(app) as c:
            assert c.get(f"/api/events/{ev.id}/imported-invitees").status_code == 403
            assert c.post(f"/api/events/{ev.id}/imported-invitees", json={"guests": [{"phone": "0501"}]}).status_code == 403
            assert c.post(f"/api/events/{ev.id}/imported-invitees/send", json={"ids": ["x"]}).status_code == 403
    finally:
        app.dependency_overrides.clear()
    db.add(models.ImportedInvitee(event_id=ev.id, first_name="أ", phone="0501111111"))
    db.commit()
    db.delete(db.get(models.Event, ev.id))
    db.commit()
    assert db.query(models.ImportedInvitee).count() == 0
