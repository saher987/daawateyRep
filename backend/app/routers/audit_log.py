"""The audit log, read side: admin only. Rows are written by app.audit.audit()
from the endpoints themselves; there's deliberately no endpoint to edit or
delete them."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["audit-log"])


@router.get("/audit-log", response_model=list[schemas.AuditLogOut])
def list_audit_log(
    actor_user_id: str | None = None,
    # Comma-separated; each one exact ("event.activate") or a prefix ending
    # in "." ("event."): "provider.,provider_category." is every provider
    # and category action.
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    environment: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> list[models.AuditLog]:
    """Newest first."""
    query = db.query(models.AuditLog)
    if actor_user_id:
        query = query.filter(models.AuditLog.actor_user_id == actor_user_id)
    actions = [a.strip() for a in (action or "").split(",") if a.strip()]
    if actions:
        query = query.filter(
            or_(
                *(
                    models.AuditLog.action.startswith(a, autoescape=True)
                    if a.endswith(".")
                    else models.AuditLog.action == a
                    for a in actions
                )
            )
        )
    if entity_type:
        query = query.filter(models.AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(models.AuditLog.entity_id == entity_id)
    if environment:
        query = query.filter(models.AuditLog.environment == environment)
    if since:
        query = query.filter(models.AuditLog.created_at >= since)
    if until:
        query = query.filter(models.AuditLog.created_at < until)
    return list(
        query.order_by(models.AuditLog.created_at.desc(), models.AuditLog.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
