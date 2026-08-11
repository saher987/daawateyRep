"""User lookup/management.

GET /api/users (admin/manager) backs both the owner/manager/invitee
lookup-by-phone-or-email pickers in CreateEvent/AddInviteeDialog *and* the
Users management page. PUT /api/users/{id} and POST /api/invites are
admin-only — spec §1 gives "invite users with any role, change roles" to
admin specifically, not manager.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["users"])


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
