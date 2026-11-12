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
import re

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import audit, changes_since, display_name, snapshot
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
    name: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[models.User]:
    query = db.query(models.User)
    if phone:
        query = query.filter(models.User.phone == phone)
    if email:
        query = query.filter(models.User.email == email)
    if name:
        # AddInviteeDialog.jsx's user picker — previously fetched up to 200
        # users and filtered client-side, missing anyone beyond that page
        # and doing the substring match in JS instead of the DB. ILIKE
        # across all three name fields since a search term could match any
        # of them (e.g. searching the nickname vs. the legal first name).
        pattern = f"%{name}%"
        query = query.filter(
            or_(
                models.User.first_name.ilike(pattern),
                models.User.last_name.ilike(pattern),
                models.User.nickname.ilike(pattern),
            )
        )
    return list(query.order_by(models.User.created_at.desc()).limit(limit).all())


def _phone_core(phone: str | None) -> str:
    """Last 9 digits: "0501234567", "972501234567" and "+972 50-123-4567"
    are the same number."""
    return re.sub(r"\D", "", phone or "")[-9:]


@router.get("/invitee-suggestions", response_model=list[schemas.InviteeSuggestion])
def invitee_suggestions(
    q: str = Query(min_length=2, max_length=60),
    limit: int = Query(default=10, le=30),
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[schemas.InviteeSuggestion]:
    """AddInviteeDialog's search: people invited to earlier events, so the
    team can add them again without retyping (the Privacy Policy says we
    keep guests' names and phones for this). Registered users are left out
    here — GET /users already returns them, with their own profile names.
    One suggestion per phone number, from its most recent invitation."""
    from app.routers.events import _resolve_display_name

    term = q.strip()
    digits = re.sub(r"\D", "", term)
    if digits.startswith("972"):
        digits = digits[3:]
    digits = digits.lstrip("0")
    conditions = []
    if len(digits) >= 3:
        conditions.append(func.regexp_replace(models.InvitationRecipient.phone, r"\D", "", "g").contains(digits))
    if not digits or len(digits) < len(term.replace(" ", "")):
        pattern = f"%{term}%"
        conditions += [
            models.InvitationRecipient.first_name.ilike(pattern),
            models.InvitationRecipient.last_name.ilike(pattern),
            models.InvitationRecipient.nickname.ilike(pattern),
            models.InvitationRecipient.external_full_name.ilike(pattern),
        ]
    if not conditions:
        return []
    rows = (
        db.query(models.InvitationRecipient)
        .filter(models.InvitationRecipient.phone.isnot(None), models.InvitationRecipient.phone != "", or_(*conditions))
        .order_by(models.InvitationRecipient.created_at.desc())
        .limit(300)
        .all()
    )
    registered = {
        _phone_core(p)
        for (p,) in db.query(models.User.phone)
        .filter(models.User.phone.in_({r.phone for r in rows} | {"972" + _phone_core(r.phone) for r in rows}))
        .all()
    }
    seen: set[str] = set()
    out: list[schemas.InviteeSuggestion] = []
    for r in rows:
        core = _phone_core(r.phone)
        if len(core) < 9 or core in seen or core in registered:
            continue
        seen.add(core)
        out.append(
            schemas.InviteeSuggestion(
                nickname=r.nickname,
                first_name=r.first_name,
                last_name=r.last_name,
                name_suffix=r.name_suffix,
                phone="0" + core,
                town=r.town,
                display_name=_resolve_display_name(r.external_full_name, r.nickname, r.first_name, r.last_name, None)
                or "0" + core,
            )
        )
        if len(out) >= limit:
            break
    return out


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    body: schemas.UserAdminUpdate,
    admin: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> models.User:
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    fields = body.model_dump(exclude_unset=True)
    before = snapshot(target, fields)
    for field, value in fields.items():
        setattr(target, field, value)
    changes = changes_since(before, target)
    if changes:
        audit(
            db,
            admin,
            "user.role_change" if "role" in changes else "user.update",
            "user",
            target.id,
            label=display_name(target),
            changes=changes,
        )
    db.commit()
    if fields.get("phone"):
        # An admin setting/changing a user's phone links the invitations
        # already sent to that number (same as update_profile does).
        from app.routers.otp import link_pending_invitations

        link_pending_invitations(db, target, fields["phone"])
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
    # The phone is cleared just below — keep it here, it's otherwise lost.
    audit(
        db,
        admin,
        "user.deactivate",
        "user",
        target.id,
        label=display_name(target),
        meta={"phone": target.phone} if target.phone else None,
    )
    # users.phone is unique (migrations/versions/0005) — a disabled account
    # has no further use for it, and leaving it in place only blocks that
    # number from ever being used again (a new phone-OTP signup, or the
    # real owner's still-active account claiming it) with a DB-level
    # conflict. Same reasoning the migration itself applies to pre-existing
    # duplicates at the time it ran.
    target.phone = None
    db.commit()
    db.refresh(target)
    _sync_firebase_active(target.firebase_uid, active=False)
    return target


@router.post("/users/{user_id}/reactivate", response_model=schemas.UserOut)
def reactivate_user(
    user_id: str,
    admin: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> models.User:
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    target.is_active = True
    audit(db, admin, "user.reactivate", "user", target.id, label=display_name(target))
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
    db.flush()
    audit(
        db,
        user,
        "user.invite",
        "pending_invite",
        invite.id,
        label=body.email,
        meta={"email": body.email, "role": body.role, "phone": body.phone},
    )
    db.commit()
    return {"success": True}
