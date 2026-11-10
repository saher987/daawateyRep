"""Table arrangement + entrance check-in, against a real Postgres.

Needs TEST_DATABASE_URL pointing at a throwaway database — every run drops
and recreates all tables in it. Skipped when it isn't set:

    export TEST_DATABASE_URL=postgresql+psycopg://dev:dev@127.0.0.1:5432/daawatey_test
    cd backend && pytest -q tests
"""

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
from app.routers import checkin as checkin_router  # noqa: E402
from app.routers.seating import auto_assign  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def admin(db):
    user = models.User(
        firebase_uid="uid-admin",
        email="admin@example.com",
        role=models.Role.admin,
        first_name="Admin",
        phone="972500000001",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def client(admin):
    app.dependency_overrides[get_app_user] = lambda: admin
    checkin_router._attempts.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _event(client, **extra):
    body = {
        "title": "حفل زفاف أحمد وليلى",
        "date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "venue_name": "قاعة الأمير",
        **extra,
    }
    r = client.post("/api/events", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _guest(db, event_id, name, count, *, side=None, group=None, town=None, rsvp="accepted", phone=None):
    r = models.InvitationRecipient(
        event_id=event_id,
        event_creator_id="uid-admin",
        external_full_name=name,
        phone=phone,
        guests_count=count,
        rsvp_status=models.RsvpStatus(rsvp),
        rsvp_guests_count=count if rsvp == "accepted" else 0,
        side=models.RecipientSide(side) if side else None,
        group_label=group,
        town=town,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# --- per-event switch --------------------------------------------------------


def test_seating_is_off_by_default(client):
    event = _event(client)
    assert event["seating_enabled"] is False and event["checkin_enabled"] is False
    assert client.get(f"/api/events/{event['id']}/seating").status_code == 409
    assert client.get(f"/api/public/checkin/{event['id']}").status_code == 404


def test_enabling_seating_creates_default_hall(client):
    event = _event(client, seating_enabled=True)
    state = client.get(f"/api/events/{event['id']}/seating").json()
    kinds = sorted(e["kind"] for e in state["hall_elements"])
    assert kinds == ["buffet", "dance_floor", "entrance", "photo", "stage"]
    # Idempotent: a second load doesn't add another set.
    again = client.get(f"/api/events/{event['id']}/seating").json()
    assert len(again["hall_elements"]) == 5


# --- tables --------------------------------------------------------------------


def test_tables_bulk_rect_and_move(client):
    event = _event(client, seating_enabled=True)
    eid = event["id"]
    state = client.post(f"/api/events/{eid}/tables/bulk", json={"count": 6, "seats_round": 10}).json()
    assert [t["number"] for t in state["tables"]] == ["1", "2", "3", "4", "5", "6"]
    assert all(t["capacity"] == 10 for t in state["tables"])

    state = client.post(
        f"/api/events/{eid}/tables",
        json={"shape": "rect", "seats_top": 5, "seats_bottom": 5, "seats_left": 1, "seats_right": 1},
    ).json()
    rect = state["tables"][-1]
    assert rect["number"] == "7" and rect["capacity"] == 12

    # One side only (head table).
    state = client.patch(f"/api/events/{eid}/tables/{rect['id']}", json={"seats_bottom": 0}).json()
    assert state["tables"][-1]["capacity"] == 7

    # Moves snap to the 10-unit grid and stay inside the plan.
    state = client.patch(f"/api/events/{eid}/tables/{rect['id']}", json={"x": 757, "y": 3}).json()
    moved = state["tables"][-1]
    assert moved["x"] % 10 == 0 and moved["x"] <= 760 - 40
    assert moved["y"] >= 40


def test_capacity_and_party_checks(client, db):
    event = _event(client, seating_enabled=True)
    eid = event["id"]
    state = client.post(f"/api/events/{eid}/tables", json={"seats_round": 4}).json()
    table = state["tables"][0]
    family = _guest(db, eid, "عائلة أبو أحمد", 6)

    # More seats than the table's chairs.
    r = client.put(
        f"/api/events/{eid}/seating",
        json={"recipients": [{"recipient_id": family.id, "allocations": [{"table_id": table["id"], "seats": 5}]}]},
    )
    assert r.status_code == 409
    # More seats than the party.
    r = client.put(
        f"/api/events/{eid}/seating",
        json={"recipients": [{"recipient_id": family.id, "allocations": [{"table_id": table["id"], "seats": 7}]}]},
    )
    assert r.status_code == 400
    # A split: 4 here, the rest waiting.
    r = client.put(
        f"/api/events/{eid}/seating",
        json={"recipients": [{"recipient_id": family.id, "allocations": [{"table_id": table["id"], "seats": 4}]}]},
    )
    assert r.status_code == 200
    assert r.json()["tables"][0]["seated"] == 4

    # Can't shrink below who's seated, can't delete a table with guests.
    assert client.patch(f"/api/events/{eid}/tables/{table['id']}", json={"seats_round": 3}).status_code == 409
    assert client.delete(f"/api/events/{eid}/tables/{table['id']}").status_code == 409

    # Empty allocations: back to waiting, then the table can go.
    r = client.put(f"/api/events/{eid}/seating", json={"recipients": [{"recipient_id": family.id, "allocations": []}]})
    assert r.json()["assignments"] == []
    assert client.delete(f"/api/events/{eid}/tables/{table['id']}").status_code == 200


def test_auto_assign_keeps_sides_and_groups_together(client, db):
    event = _event(client, seating_enabled=True)
    eid = event["id"]
    client.post(f"/api/events/{eid}/tables/bulk", json={"count": 4, "seats_round": 10})
    school_a = _guest(db, eid, "خالد", 2, side="groom", group="أصدقاء المدرسة")
    school_b = _guest(db, eid, "مازن", 2, side="groom", group="أصدقاء المدرسة")
    bride_family = _guest(db, eid, "عائلة خوري", 7, side="bride", group="العائلة")
    big = _guest(db, eid, "عمّ العريس", 13, side="groom", group="العائلة")
    declined = _guest(db, eid, "لن يأتي", 3, rsvp="declined")

    r = client.post(f"/api/events/{eid}/seating/auto-assign").json()
    assert r["split"] == 1 and r["left"] == 0
    table_of: dict[str, set[str]] = {}
    for a in r["state"]["assignments"]:
        table_of.setdefault(a["recipient_id"], set()).add(a["table_id"])
    assert table_of[school_a.id] == table_of[school_b.id]
    assert len(table_of[big.id]) == 2
    assert declined.id not in table_of
    # The bride's family never shares a table with the groom's side.
    groom_tables = table_of[school_a.id] | table_of[big.id]
    assert not (table_of[bride_family.id] & groom_tables)
    # Running again changes nothing: everyone confirmed already has a seat.
    again = client.post(f"/api/events/{eid}/seating/auto-assign").json()
    assert again["placed"] == 0 and len(again["state"]["assignments"]) == len(r["state"]["assignments"])


def test_auto_assign_pure():
    class T:
        def __init__(self, id, cap):
            self.id, self.capacity = id, cap

    class R:
        def __init__(self, id, n, side=None, group=None):
            self.id, self.rsvp_guests_count, self.guests_count = id, n, n
            self.side, self.group_label, self.town = side, group, None
            self.rsvp_status = models.RsvpStatus.accepted

    rows, placed, split, left = auto_assign([R("a", 30)], [T("t1", 10), T("t2", 10)], [])
    assert (placed, split, left) == (0, 0, 1) and rows == []


def test_grouping_and_group_names(client, db):
    event = _event(client)
    eid = event["id"]
    a = _guest(db, eid, "أ", 2)
    b = _guest(db, eid, "ب", 2)
    r = client.patch(
        f"/api/events/{eid}/recipients/grouping",
        json={"recipient_ids": [a.id, b.id], "side": "groom", "group_label": "  أصدقاء المدرسة "},
    )
    assert r.status_code == 200
    assert {x["side"] for x in r.json()} == {"groom"}
    # Only side sent: group stays.
    r = client.patch(f"/api/events/{eid}/recipients/grouping", json={"recipient_ids": [a.id], "side": None})
    assert r.json()[0]["side"] is None and r.json()[0]["group_label"] == "أصدقاء المدرسة"
    names = client.get(f"/api/events/{eid}/groups").json()
    assert names["groom"] == ["أصدقاء المدرسة"] and names["none"] == ["أصدقاء المدرسة"]


def test_invitation_page_shows_table_only_when_published(client, db):
    event = _event(client, seating_enabled=True)
    eid = event["id"]
    state = client.post(f"/api/events/{eid}/tables", json={}).json()
    guest = _guest(db, eid, "عائلة أبو أحمد", 6)
    client.put(
        f"/api/events/{eid}/seating",
        json={"recipients": [{"recipient_id": guest.id, "allocations": [{"table_id": state["tables"][0]["id"], "seats": 6}]}]},
    )
    page = client.get(f"/api/invitations/{guest.personal_token}").json()
    assert page["tables"] == [] and page["hall_plan"] is None

    client.put(f"/api/events/{eid}/seating/settings", json={"seating_published": True})
    page = client.get(f"/api/invitations/{guest.personal_token}").json()
    assert page["tables"][0]["number"] == "1" and page["tables"][0]["seats"] == 6
    assert len(page["hall_plan"]["tables"]) == 1

    # Turning seating off hides it again, without losing the arrangement.
    client.put(f"/api/events/{eid}", json={"seating_enabled": False})
    page = client.get(f"/api/invitations/{guest.personal_token}").json()
    assert page["tables"] == []


# --- entrance check-in ---------------------------------------------------------


def test_check_in_flow(client, db):
    soon = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    event = _event(client, date=soon, checkin_enabled=True, seating_enabled=True)
    eid = event["id"]
    state = client.post(f"/api/events/{eid}/tables", json={}).json()
    guest = _guest(db, eid, "عائلة أبو أحمد", 6, phone="0501234567")
    declined = _guest(db, eid, "رفض", 2, rsvp="declined", phone="0507654321")
    client.put(
        f"/api/events/{eid}/seating",
        json={"recipients": [{"recipient_id": guest.id, "allocations": [{"table_id": state["tables"][0]["id"], "seats": 6}]}]},
    )
    client.put(f"/api/events/{eid}/seating/settings", json={"seating_published": True})

    info = client.get(f"/api/public/checkin/{eid}").json()
    assert info["open"] is True and info["seating"] is True

    # Recognised from the invitation link's token.
    found = client.post(f"/api/public/checkin/{eid}/lookup", json={"personal_token": guest.personal_token}).json()
    assert found["display_name"] and found["tables"][0]["number"] == "1" and found["checked_in"] is False
    # Or by phone, in another format.
    found = client.post(f"/api/public/checkin/{eid}/lookup", json={"phone": "+972 50-123-4567"})
    assert found.status_code == 200
    # Unknown or declined: same 404.
    assert client.post(f"/api/public/checkin/{eid}/lookup", json={"phone": "0509999999"}).status_code == 404
    assert client.post(f"/api/public/checkin/{eid}/lookup", json={"phone": "0507654321"}).status_code == 404
    assert declined.id

    r = client.post(f"/api/public/checkin/{eid}", json={"personal_token": guest.personal_token, "people_arrived": 4})
    assert r.json()["checked_in"] is True and r.json()["people_arrived"] == 4
    # A second scan updates, never doubles.
    client.post(f"/api/public/checkin/{eid}", json={"phone": "0501234567", "people_arrived": 6})
    arrivals = client.get(f"/api/events/{eid}/arrivals").json()
    assert arrivals["checked_in_invitations"] == 1 and arrivals["people_arrived"] == 6
    assert arrivals["expected_people"] == 6
    assert arrivals["per_table"][0]["arrived"] == 6

    # Host unmarks / marks by hand.
    assert client.delete(f"/api/events/{eid}/arrivals/{guest.id}").json()["people_arrived"] == 0
    assert client.post(f"/api/events/{eid}/arrivals", json={"recipient_id": guest.id, "people_arrived": 5}).json()[
        "arrivals"
    ][0]["method"] == "host_manual"


def test_check_in_closed_outside_event_day(client, db):
    event = _event(client, checkin_enabled=True)
    guest = _guest(db, event["id"], "ضيف", 2)
    assert client.get(f"/api/public/checkin/{event['id']}").json()["open"] is False
    r = client.post(f"/api/public/checkin/{event['id']}/lookup", json={"personal_token": guest.personal_token})
    assert r.status_code == 409


def test_check_in_without_seating_has_no_table(client, db):
    soon = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    event = _event(client, date=soon, checkin_enabled=True)
    guest = _guest(db, event["id"], "ضيف", 2)
    found = client.post(f"/api/public/checkin/{event['id']}/lookup", json={"personal_token": guest.personal_token}).json()
    assert found["tables"] == [] and found["hall_plan"] is None
    assert client.get(f"/api/events/{event['id']}/arrivals").json()["per_table"] == []


def test_check_in_rate_limit(client, db):
    soon = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    event = _event(client, date=soon, checkin_enabled=True)
    codes = [
        client.post(f"/api/public/checkin/{event['id']}/lookup", json={"phone": f"05000000{i:02d}"}).status_code
        for i in range(checkin_router._RATE_LIMIT + 1)
    ]
    assert codes[-1] == 429 and set(codes[:-1]) == {404}


def test_venue_owner_sees_counts_only(client, db, admin):
    venue = models.Venue(name="قاعة الأمير", owner_phones=["972500000001"])
    db.add(venue)
    db.commit()
    event = _event(client, venue_id=venue.id, checkin_enabled=True)
    counts = client.get(f"/api/venues/{venue.id}/arrivals").json()
    assert counts[0]["event_id"] == event["id"]
    assert set(counts[0]) == {"event_id", "event_title", "checked_in_invitations", "people_arrived", "expected_people"}


def test_deleting_invitee_and_event_cleans_up(client, db):
    soon = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    event = _event(client, date=soon, seating_enabled=True, checkin_enabled=True)
    eid = event["id"]
    state = client.post(f"/api/events/{eid}/tables", json={}).json()
    a = _guest(db, eid, "أ", 2)
    b = _guest(db, eid, "ب", 2)
    client.put(
        f"/api/events/{eid}/seating",
        json={"recipients": [
            {"recipient_id": a.id, "allocations": [{"table_id": state["tables"][0]["id"], "seats": 2}]},
            {"recipient_id": b.id, "allocations": [{"table_id": state["tables"][0]["id"], "seats": 2}]},
        ]},
    )
    client.post(f"/api/events/{eid}/arrivals", json={"recipient_id": a.id, "people_arrived": 2})

    assert client.delete(f"/api/invitation-recipients/{a.id}").status_code == 204
    state = client.get(f"/api/events/{eid}/seating").json()
    assert [x["recipient_id"] for x in state["assignments"]] == [b.id]
    assert client.get(f"/api/events/{eid}/arrivals").json()["checked_in_invitations"] == 0

    assert client.delete(f"/api/events/{eid}").status_code == 204
    db.expire_all()
    assert db.query(models.EventTable).count() == 0
    assert db.query(models.HallElement).count() == 0
