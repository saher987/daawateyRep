"""User lookup — admin/manager only. Backs the owner/manager and invitee
pickers in CreateEvent/AddInviteeDialog (search an existing account by
phone or email so an event/invitee can be linked to it)."""

from fastapi import APIRouter, Depends, Query
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
