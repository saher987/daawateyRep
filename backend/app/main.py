import os

import firebase_admin
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth as firebase_auth
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user
from app.db import get_db
from app.routers import event_requests, events, notifications, otp, planned_weddings, users, venues

app = FastAPI(title="daawatey backend")
app.include_router(events.router)
app.include_router(notifications.router)
app.include_router(event_requests.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(otp.router)
app.include_router(planned_weddings.router)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _me_response(user: models.User) -> schemas.MeResponse:
    return schemas.MeResponse(
        id=user.id,
        uid=user.firebase_uid,
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        nickname=user.nickname,
        town=user.town,
        phone=user.phone,
        preferred_language=user.preferred_language,
        photo_url=user.photo_url,
        profile_complete=user.profile_complete,
    )


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness check used by Cloud Run and local dev."""
    return {"status": "ok"}


@app.get("/api/me", response_model=schemas.MeResponse)
def me(user: models.User = Depends(get_app_user)) -> schemas.MeResponse:
    """The verified Firebase identity plus the app-level role/profile
    layered on top of it (see BUSINESS_LOGIC.md) — this is what the
    frontend's AppLayout uses to decide navigation and whether to redirect
    to /profile (spec §2's profile-completion enforcement)."""
    return _me_response(user)


@app.put("/api/profile", response_model=schemas.MeResponse)
def update_profile(
    body: schemas.ProfileUpdate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.MeResponse:
    """Flow G step 3: replaces base44.auth.updateMe. PATCH semantics — only
    fields actually sent get updated (see ProfileUpdate's docstring for why)."""
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return _me_response(user)


@app.delete("/api/account", status_code=204)
def delete_account(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> None:
    """deleteAccount. The original just soft-deleted (set role='deleted'),
    a platform-specific sentinel that doesn't map onto a real Role value
    here. This does the real thing instead: removes the app-level row *and*
    the Firebase account itself, so the same identity can't silently get a
    fresh row recreated by get_app_user on a future sign-in."""
    firebase_uid = user.firebase_uid
    db.delete(user)
    db.commit()
    try:
        firebase_auth.delete_user(firebase_uid)
    except firebase_admin.exceptions.FirebaseError:
        # The Postgres row is already gone — the account is effectively
        # deleted from this app's point of view even if the Firebase-side
        # cleanup didn't succeed (e.g. already deleted there). Not
        # re-raising: the caller asked to delete their account and that
        # part succeeded.
        pass
