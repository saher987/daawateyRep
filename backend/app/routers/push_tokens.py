"""Registers an FCM device token for the signed-in user (web push service
worker or the native app's push-notifications plugin) — see
app.integrations.push for where these actually get used."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user
from app.db import get_db

router = APIRouter(prefix="/api", tags=["push"])


@router.post("/push-tokens", status_code=204)
def register_push_token(
    body: schemas.PushTokenRegister,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> None:
    """Upsert by token, not by (user_id, platform): the same physical
    device/browser calling this again (a page reload, a fresh app launch)
    should just update its existing row — including re-pointing it at
    `user` if a *different* account is now signed in on this device, e.g.
    someone signed out and a different guest signed in on the same phone."""
    existing = db.query(models.PushToken).filter(models.PushToken.token == body.token).one_or_none()
    if existing is not None:
        existing.user_id = user.id
        existing.platform = body.platform
    else:
        db.add(models.PushToken(user_id=user.id, token=body.token, platform=body.platform))
    db.commit()
