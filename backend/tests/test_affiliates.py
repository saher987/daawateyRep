"""Affiliate program: referral capture, the commission rules when an event
is marked paid, approval, payouts, applications and "My referrals"."""

import os
from datetime import datetime, timedelta, timezone

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
from app.routers import affiliates, event_requests  # noqa: E402


@pytest.fixture()
def db(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(affiliates, "send_sms", lambda phone, text, reference: True)
    monkeypatch.setattr(event_requests, "send_push_to_user", lambda *a, **k: None)
    session = SessionLocal()
    yield session
    session.close()
    app.dependency_overrides.clear()


def _user(db, uid, role=models.Role.user, phone=None):
    u = models.User(firebase_uid=uid, email=f"{uid}@x.com", role=role, first_name=uid.capitalize(), phone=phone)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _as(user):
    app.dependency_overrides[get_app_user] = lambda: user
    return TestClient(app)


def _event(db, owner_phone, title="Wedding", venue_id=None, created_at=None):
    e = models.Event(
        title=title,
        date=datetime(2027, 1, 3, tzinfo=timezone.utc),
        venue_name="Hall",
        venue_id=venue_id,
        owner_phones=[owner_phone],
        manager_phones=[],
        created_by_uid="admin",
    )
    if created_at:
        e.created_at = created_at
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _add_dana(c):
    r = c.post("/api/manage/affiliates", json={"name": "Dana Levi", "phone": "052-987-6543", "kind": "planner"})
    assert r.status_code == 201, r.text
    return r.json()


def test_full_flow_request_form_to_payout(db):
    admin = _user(db, "admin", models.Role.admin)
    dana = _add_dana(_as(admin))
    assert dana["code"] == "DANALEVI20" and dana["sms_sent"] is True and dana["status"] == "active"

    # Public lookup for the banner.
    assert TestClient(app).get("/api/affiliates/code/danalevi20").json()["name"] == "Dana Levi"

    # The customer requests an event with the code.
    customer = _user(db, "shira", phone="0501234567")
    r = _as(customer).post(
        "/api/event-requests",
        json={"title": "عرس", "details": "x", "requester_phone": "050-123-4567", "requester_name": "Shira A", "referral_code": " danalevi20 "},
    )
    assert r.status_code == 201, r.text
    assert r.json()["referral_code"] == "DANALEVI20"
    ref = db.query(models.Referral).one()
    assert ref.phone == "972501234567" and ref.source == "request_form"

    event = _event(db, "972501234567")
    c = _as(admin)
    # No price yet: can't mark paid.
    assert c.put(f"/api/events/{event.id}/payment", json={"paid": True}).status_code == 400
    p = c.get(f"/api/events/{event.id}/payment").json()
    assert p["referral_code"] == "DANALEVI20" and p["commission"] is None

    p = c.put(f"/api/events/{event.id}/payment", json={"price": 300, "paid": True}).json()
    assert p["paid_at"] and p["commission"]["amount"] == 60 and p["commission"]["status"] == "pending"
    assert p["commission"]["customer_name"] == "Shira"
    assert all(ch["ok"] for ch in p["checks"])

    # Price corrected while pending: the commission follows.
    p = c.put(f"/api/events/{event.id}/payment", json={"price": 350}).json()
    assert p["commission"]["amount"] == 70

    # A second event of the same customer: repeat_pct is 0, nothing.
    second = _event(db, "972501234567", title="Henna")
    p = c.put(f"/api/events/{second.id}/payment", json={"price": 300, "paid": True}).json()
    assert p["commission"] is None and p["commission_skipped"] == "first_event"

    # Approve; 70 is under the 100 minimum, so a plain payout skips Dana.
    cid = db.query(models.AffiliateCommission).one().id
    assert c.post(f"/api/manage/affiliate-commissions/{cid}/decision", json={"action": "approve"}).json()["status"] == "approved"
    assert c.post("/api/manage/affiliate-payouts", json={}).json() == {"affiliates": 0, "commissions": 0, "total": 0}
    # Paying her explicitly works.
    out = c.post("/api/manage/affiliate-payouts", json={"affiliate_ids": [dana["id"]], "reference": "bank 11"}).json()
    assert out == {"affiliates": 1, "commissions": 1, "total": 70}
    row = c.get("/api/manage/affiliates").json()[0]
    assert row["customers"] == 1 and row["paid_events"] == 1 and row["paid_amount"] == 70

    # A paid-out commission blocks un-marking the event.
    assert c.put(f"/api/events/{event.id}/payment", json={"paid": False}).status_code == 409

    # Dana's own page: first name only, the commission's status.
    dana_user = _user(db, "dana", phone="0529876543")
    mine = _as(dana_user).get("/api/my-affiliate").json()
    assert mine["link"].endswith("/r/DANALEVI20")
    assert mine["referrals"][0]["name"] == "Shira" and mine["referrals"][0]["commission_status"] == "paid"
    assert _as(dana_user).get("/api/me").json()["affiliate_status"] == "active"


def test_rules_block_commission(db):
    admin = _user(db, "admin", models.Role.admin)
    c = _as(admin)
    dana = _add_dana(c)
    aff = db.get(models.Affiliate, dana["id"])

    # Self-referral is refused when claiming.
    dana_user = _user(db, "dana", phone="0529876543")
    assert _as(dana_user).post("/api/referrals/claim", json={"code": aff.code}).json()["result"] == "self"

    # Link claim, then an excluded venue.
    noor = _user(db, "noor", phone="0541112222")
    assert _as(noor).post("/api/referrals/claim", json={"code": aff.code}).json()["result"] == "created"
    assert _as(noor).post("/api/referrals/claim", json={"code": aff.code}).json()["result"] == "exists"
    venue = models.Venue(name="Partner hall", owner_phones=[])
    db.add(venue)
    db.commit()
    c = _as(admin)
    assert c.put(f"/api/manage/venues/{venue.id}/affiliate-excluded", json={"affiliate_excluded": True}).json()["affiliate_excluded"]
    e = _event(db, "972541112222", venue_id=venue.id)
    p = c.put(f"/api/events/{e.id}/payment", json={"price": 300, "paid": True}).json()
    assert p["commission"] is None and p["commission_skipped"] == "not_excluded"

    # Outside the 60-day window.
    sami = _user(db, "sami", phone="0543334444")
    _as(sami).post("/api/referrals/claim", json={"code": aff.code})
    ref = db.query(models.Referral).filter_by(phone="972543334444").one()
    ref.created_at = datetime.now(timezone.utc) - timedelta(days=90)
    db.commit()
    late = _event(db, "972543334444")
    p = _as(admin).put(f"/api/events/{late.id}/payment", json={"price": 300, "paid": True}).json()
    assert p["commission_skipped"] == "in_window"

    # A shareholder affiliate never earns.
    c = _as(admin)
    c.put(f"/api/manage/affiliates/{aff.id}", json={"excluded": True})
    lina = _user(db, "lina", phone="0545556666")
    _as(lina).post("/api/referrals/claim", json={"code": aff.code})
    e2 = _event(db, "972545556666")
    p = _as(admin).put(f"/api/events/{e2.id}/payment", json={"price": 300, "paid": True}).json()
    assert p["commission_skipped"] == "not_excluded"
    assert db.query(models.AffiliateCommission).count() == 0


def test_admin_attaches_code_and_unmark_removes_commission(db):
    admin = _user(db, "admin", models.Role.admin)
    c = _as(admin)
    dana = _add_dana(c)
    e = _event(db, "972507778888")
    assert c.put(f"/api/events/{e.id}/payment", json={"referral_code": "NOPE"}).status_code == 400
    p = c.put(f"/api/events/{e.id}/payment", json={"referral_code": dana["code"], "price": 300, "paid": True}).json()
    assert p["referral_source"] == "admin" and p["commission"]["amount"] == 60
    assert c.put(f"/api/events/{e.id}/payment", json={"referral_code": dana["code"]}).status_code == 409
    p = c.put(f"/api/events/{e.id}/payment", json={"paid": False}).json()
    assert p["paid_at"] is None and p["commission"] is None
    # Delete is refused only with commissions; none left now.
    assert c.delete(f"/api/manage/affiliates/{dana['id']}").status_code == 204


def test_application_and_review(db):
    admin = _user(db, "admin", models.Role.admin)
    photographer = _user(db, "or", phone="0521110000")
    c = _as(photographer)
    assert c.post("/api/affiliate-applications", json={"name": "Studio Or", "accepted_terms": False}).status_code == 400
    r = c.post("/api/affiliate-applications", json={"name": "Studio Or", "kind": "photo", "code": "or20", "note": "40 weddings", "accepted_terms": True})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "pending" and r.json()["code"] == "OR20"
    assert c.post("/api/affiliate-applications", json={"name": "Again", "accepted_terms": True}).status_code == 409
    assert c.get("/api/me").json()["affiliate_status"] == "pending"
    # The team is told.
    assert db.query(models.Notification).filter_by(target_user_email="admin@x.com", link="/affiliates").count() == 1
    # A pending code doesn't work yet.
    assert TestClient(app).get("/api/affiliates/code/OR20").status_code == 404
    # Not for regular users.
    assert c.get("/api/manage/affiliates").status_code == 403

    aff_id = r.json()["id"]
    out = _as(admin).post(f"/api/manage/affiliates/{aff_id}/review", json={"action": "approve"}).json()
    assert out["status"] == "active" and out["sms_sent"] is True
    assert TestClient(app).get("/api/affiliates/code/or20").status_code == 200

    # Code clashes.
    assert _as(admin).post("/api/manage/affiliates", json={"name": "X", "phone": "0500000001", "code": "OR20"}).status_code == 409
    assert _as(admin).post("/api/manage/affiliates", json={"name": "X", "phone": "0500000001", "code": "a!"}).status_code == 400
    # Arabic name: DW + digits.
    out = _as(admin).post("/api/manage/affiliates", json={"name": "سامي", "phone": "0500000001"}).json()
    assert out["code"].startswith("DW") and len(out["code"]) == 6
