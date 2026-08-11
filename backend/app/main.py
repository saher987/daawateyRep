import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user
from app.db import get_db
from app.routers import events

app = FastAPI(title="daawatey backend")
app.include_router(events.router)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return schemas.MeResponse(
        uid=user.firebase_uid,
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        town=user.town,
        phone=user.phone,
        preferred_language=user.preferred_language,
        profile_complete=user.profile_complete,
    )


@app.put("/api/profile", response_model=schemas.MeResponse)
def update_profile(
    body: schemas.ProfileUpdate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.MeResponse:
    """Flow G step 3: replaces base44.auth.updateMe. Persists the profile
    fields AppLayout requires before letting the user past /profile."""
    user.first_name = body.first_name
    user.last_name = body.last_name
    user.town = body.town
    user.phone = body.phone
    if body.preferred_language is not None:
        user.preferred_language = body.preferred_language
    db.commit()
    db.refresh(user)
    return schemas.MeResponse(
        uid=user.firebase_uid,
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        town=user.town,
        phone=user.phone,
        preferred_language=user.preferred_language,
        profile_complete=user.profile_complete,
    )
