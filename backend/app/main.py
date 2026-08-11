import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user
from app.db import get_db
from app.routers import event_requests, events, notifications

app = FastAPI(title="daawatey backend")
app.include_router(events.router)
app.include_router(notifications.router)
app.include_router(event_requests.router)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _me_response(user: models.User) -> schemas.MeResponse:
    return schemas.MeResponse(
        uid=user.firebase_uid,
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        nickname=user.nickname,
        town=user.town,
        phone=user.phone,
        preferred_language=user.preferred_language,
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
