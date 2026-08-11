"""Firebase ID token verification.

Every protected route depends on `get_current_user`, which verifies the
caller's Firebase ID token via the Admin SDK and returns the identity it
finds *in the verified token*. Nothing here ever trusts a user id, email,
or role supplied by the client in the request body, query params, or any
other header — that would let a client impersonate anyone.
"""

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.db import get_db

logger = logging.getLogger(__name__)

# Uses Application Default Credentials: the attached service account on
# Cloud Run (which also exposes the project via the metadata server), or
# `gcloud auth application-default login` for local dev. No service account
# key file is committed to this repo.
#
# User-login ADC (the local dev case) doesn't carry a project id the way a
# service account credential does, so it must be passed explicitly here via
# GOOGLE_CLOUD_PROJECT — otherwise verify_id_token() fails with "A project
# ID is required to access the auth service."
if not firebase_admin._apps:
    _project_id = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
    firebase_admin.initialize_app(options={"projectId": _project_id} if _project_id else None)

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    email: str | None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
    except Exception as exc:
        # Log the real reason server-side; the client only ever gets a
        # generic 401 — never leak verification internals to the caller.
        logger.warning("Firebase ID token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email"))


def get_app_user(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.User:
    """The app-level identity: role + profile, on top of the verified
    Firebase identity. Firebase only ever proves *who* someone is — this is
    the single source of truth for *what they're allowed to do*.

    On a brand-new Firebase account's first request, a `users` row is
    created here. This replaces Base44's `base44.users.inviteUser(email,
    role)` (spec §1): if an admin/manager already created a matching
    `pending_invites` row for this email, that role is granted and the
    invite consumed; otherwise this is a normal self-serve signup (Flow
    B/C) and gets the baseline `user` role. There is no path for a client
    to request any role for itself.
    """
    user = db.query(models.User).filter_by(firebase_uid=current.uid).one_or_none()
    if user is not None:
        return user

    invite = (
        db.query(models.PendingInvite)
        .filter_by(email=current.email, consumed_at=None)
        .order_by(models.PendingInvite.created_at.desc())
        .first()
        if current.email
        else None
    )
    role = invite.role if invite is not None else models.Role.user

    # Firebase's email field is optional in principle (e.g. phone-only
    # auth); `users.email` is NOT NULL + unique, so fall back to a
    # placeholder that can never collide with a real address instead of
    # letting this dependency crash for that edge case.
    email = current.email or f"{current.uid}@no-email.invalid"

    user = models.User(firebase_uid=current.uid, email=email, role=role)
    db.add(user)
    if invite is not None:
        invite.consumed_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError:
        # Two concurrent first-requests from the same brand-new account
        # both tried to create the row — the loser here just reads what the
        # winner committed instead of erroring out.
        db.rollback()
        user = db.query(models.User).filter_by(firebase_uid=current.uid).one()
    else:
        db.refresh(user)
    return user


def require_role(*roles: models.Role):
    """FastAPI dependency factory: 403s unless the signed-in app user's role
    is one of `roles`. Encodes the role table in BUSINESS_LOGIC.md/spec §1."""

    def _dependency(user: models.User = Depends(get_app_user)) -> models.User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(r.value for r in roles)}",
            )
        return user

    return _dependency
