"""DAW-52: earlier invitees offered in the add-invitee search."""

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


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    yield session
    session.close()


def _user(db, role, phone):
    u = models.User(firebase_uid=f"uid-{phone}", email=f"{phone}@x.com", role=role, phone=phone, first_name="رامي")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_suggests_earlier_invitees_once_per_phone(db):
    admin = _user(db, models.Role.admin, "972500000001")
    _user(db, models.Role.user, "972521111111")  # registered: GET /users finds them
    ev = models.Event(title="عرس", date=datetime.now(timezone.utc) + timedelta(days=9), venue_name="قاعة", created_by_uid="x")
    db.add(ev)
    db.commit()
    for name, phone in [("رامي خوري", "0547777777"), ("رامي خوري الكبير", "972547777777"),
                        ("رامي حداد", "0521111111"), ("سامر", "0538888888")]:
        db.add(models.InvitationRecipient(event_id=ev.id, event_creator_id="x", external_full_name=name, phone=phone))
    db.commit()

    app.dependency_overrides[get_app_user] = lambda: admin
    try:
        with TestClient(app) as c:
            by_name = c.get("/api/invitee-suggestions", params={"q": "رامي"}).json()
            assert [s["phone"] for s in by_name] == ["0547777777"]  # one per phone, registered left out
            by_phone = c.get("/api/invitee-suggestions", params={"q": "053-888"}).json()
            assert [s["display_name"] for s in by_phone] == ["سامر"]
            owner = _user(db, models.Role.user, "972539999999")
            app.dependency_overrides[get_app_user] = lambda: owner
            assert c.get("/api/invitee-suggestions", params={"q": "رامي"}).status_code == 403
    finally:
        app.dependency_overrides.clear()
