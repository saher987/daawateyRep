"""Flow C: a regular user requests an event; admins/managers review it.

Ported from the original's two separate calls (EventRequest.create +
functions.invoke('notifyEventRequest', ...)) into one endpoint that does
both atomically — the frontend shim keeps calling both for compatibility
with the unmodified ported component, but the notify call becomes a no-op
since this endpoint already did it. See BUSINESS_LOGIC.md.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user, require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["event-requests"])


@router.post(
    "/event-requests", response_model=schemas.EventRequestOut, status_code=status.HTTP_201_CREATED
)
def create_event_request(
    body: schemas.EventRequestCreate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.EventRequest:
    request = models.EventRequest(**body.model_dump(), requester_uid=user.firebase_uid)
    db.add(request)
    db.flush()

    # notifyEventRequest: notify every admin/manager, same wording as the
    # original.
    display_name = request.requester_name or user.email
    privileged = (
        db.query(models.User)
        .filter(models.User.role.in_([models.Role.admin, models.Role.manager]))
        .all()
    )
    for admin in privileged:
        db.add(
            models.Notification(
                type=models.NotificationType.event_update,
                title="طلب مناسبة جديد",
                message=f'{display_name} يطلب فتح مناسبة: "{request.title}"',
                is_read=False,
                target_user_email=admin.email,
            )
        )
    db.commit()
    db.refresh(request)
    return request


@router.get("/event-requests", response_model=list[schemas.EventRequestOut])
def list_event_requests(
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[models.EventRequest]:
    """Flow C step 4: admin reviews at /event-requests."""
    return list(db.query(models.EventRequest).order_by(models.EventRequest.created_at.desc()).all())


@router.put("/event-requests/{request_id}", response_model=schemas.EventRequestOut)
def update_event_request(
    request_id: str,
    body: schemas.EventRequestUpdate,
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.EventRequest:
    """Flow C step 4: mark handled (approved) or rejected, with notes."""
    request = db.get(models.EventRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Event request not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(request, field, value)
    db.commit()
    db.refresh(request)
    return request
