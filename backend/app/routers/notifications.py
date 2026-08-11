"""In-app notifications (Flow F). Targeted by email, polled every 30s by
AppLayout in the original — same model here."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user
from app.db import get_db

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications", response_model=list[schemas.NotificationOut])
def list_notifications(
    unread_only: bool = False,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.Notification]:
    query = db.query(models.Notification).filter(
        models.Notification.target_user_email == user.email
    )
    if unread_only:
        query = query.filter(models.Notification.is_read.is_(False))
    return list(query.order_by(models.Notification.created_at.desc()).all())


@router.post("/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_notification_read(
    notification_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Notification:
    notification = db.get(models.Notification, notification_id)
    # Same rule as everywhere: 404 rather than 403 on a mismatched owner —
    # doesn't confirm to the caller that a notification with this id exists
    # at all if it isn't theirs.
    if notification is None or notification.target_user_email != user.email:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/notifications/mark-all-read")
def mark_all_notifications_read(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    db.query(models.Notification).filter(
        models.Notification.target_user_email == user.email,
        models.Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"success": True}
