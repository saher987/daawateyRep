"""User lookup/management.

GET /api/users (admin/manager) backs both the owner/manager/invitee
lookup-by-phone-or-email pickers in CreateEvent/AddInviteeDialog *and* the
Users management page. PUT /api/users/{id}, DELETE /api/users/{id},
POST /api/users/{id}/reactivate, and POST /api/invites are admin-only —
spec §1 gives "invite users with any role, change roles" to admin
specifically, not manager.
"""

import logging

import firebase_admin
from fastapi import APIRouter, Depends, HTTPException, Query, status
from firebase_admin import auth as firebase_auth
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import require_role
from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["users"])


def _sync_firebase_active(firebase_uid: str, *, active: bool) -> None:
    """Best-effort mirror of is_active onto the Firebase account itself.

    The Postgres flag (checked by get_app_user on every request) is what
    actually enforces the ban/unban — this only affects new sign-ins and
    how fast an already-issued ID token stops working. Not fatal if it
    fails (e.g. the Firebase user was already deleted separately): the app-
    level state is still correct either way, same reasoning as
    delete_account's non-fatal firebase_auth.delete_user in main.py.
    """
    try:
        firebase_auth.update_user(firebase_uid, disabled=not active)
        if not active:
            # disabled=True alone doesn't invalidate a token already handed
            # to the browser — it can stay valid up to its ~1h expiry
            # otherwise. Revoking kills it immediately on the next refresh.
            firebase_auth.revoke_refresh_tokens(firebase_uid)
    except firebase_admin.exceptions.FirebaseError:
        logger.warning(
            "Firebase-side %s failed for uid=%s (app-level is_active is still authoritative)",
            "disable" if not active else "re-enable",
            firebase_uid,
        )


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    phone: str | None = Query(default=None),
    email: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[models.User]:
    query = db.query(models.User)
    if phone:
        query = query.filter(models.User.phone == phone)
    if email:
        query = query.filter(models.User.email == email)
    return list(query.order_by(models.User.created_at.desc()).limit(limit).all())


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    body: schemas.UserAdminUpdate,
    _: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> models.User:
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", response_model=schemas.UserOut)
def deactivate_user(
    user_id: str,
    admin: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> models.User:
    """Deals with an unwanted account (spam, abuse, ...) without erasing it:
    marks it inactive rather than deleting the row, unlike DELETE
    /api/account (self-service, a real hard delete — see main.py). A hard
    delete here isn't even possible in the general case anyway —
    invitation_recipients.user_id is a real FK to users.id with no ondelete,
    so it'd fail outright the moment this user ever linked an RSVP — and
    even where it wouldn't fail, events/venues they created stay live for
    real guests, with no "transfer ownership" feature to hand those off
    first. See models.User.is_active's docstring."""
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.id == admin.id:
        # Not a data-integrity concern (unlike the FK issue above) — just
        # against locking the only admin present out mid-action.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own account"
        )
    target.is_active = False
    db.commit()
    db.refresh(target)
    _sync_firebase_active(target.firebase_uid, active=False)
    return target


@router.post("/users/{user_id}/reactivate", response_model=schemas.UserOut)
def reactivate_user(
    user_id: str,
    _: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> models.User:
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    target.is_active = True
    db.commit()
    db.refresh(target)
    _sync_firebase_active(target.firebase_uid, active=True)
    return target


@router.post("/invites", status_code=status.HTTP_201_CREATED)
def create_invite(
    body: schemas.InviteCreate,
    user: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    """base44.users.inviteUser(email, role)'s replacement. See
    PendingInvite/InviteCreate's docstrings for why this is lazily consumed
    on first sign-in rather than provisioning an account immediately."""
    invite = models.PendingInvite(
        email=body.email,
        role=body.role,
        phone=body.phone,
        invited_by_uid=user.firebase_uid,
    )
    db.add(invite)
    db.commit()
    return {"success": True}
