"""A business owner listing a new service accepts the Privacy Policy and Terms."""

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


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    yield session
    session.close()


def test_new_listing_records_terms_acceptance(db):
    user = models.User(firebase_uid="uid-p", email="p@x.com", role=models.Role.user, phone="972501111111", first_name="سامر")
    cat = models.ProviderCategory(name_ar="تصوير", name_he="צילום")
    db.add_all([user, cat])
    db.commit()
    body = {"category_id": cat.id, "name": "استوديو النور", "phone": "0501111111"}
    app.dependency_overrides[get_app_user] = lambda: user
    try:
        with TestClient(app) as c:
            assert c.post("/api/my-providers", json={**body, "accepted_terms": False}).status_code == 400
            r = c.post("/api/my-providers", json={**body, "accepted_terms": True})
            assert r.status_code == 201, r.text
            row = db.query(models.AuditLog).filter_by(action="provider.submit").one()
            assert row.meta == {"accepted_terms": True} and row.entity_id == r.json()["id"]
            # Older app builds without the box still work (and are recorded as such).
            assert c.post("/api/my-providers", json={**body, "name": "اخر"}).status_code == 201
    finally:
        app.dependency_overrides.clear()
