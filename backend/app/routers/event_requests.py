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
from app.audit import audit, changes_since, snapshot
from app.auth import get_app_user, require_role
from app.db import get_db
from app.integrations.push import send_push_to_user
from app.routers import affiliates

router = APIRouter(prefix="/api", tags=["event-requests"])

# Where the "new event request" notification and push lead (EventRequests.jsx).
EVENT_REQUESTS_PATH = "/event-requests"


@router.post(
    "/event-requests", response_model=schemas.EventRequestOut, status_code=status.HTTP_201_CREATED
)
def create_event_request(
    body: schemas.EventRequestCreate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.EventRequest:
    data = body.model_dump()
    data["referral_code"] = (data.get("referral_code") or "").strip().upper() or None
    request = models.EventRequest(**data, requester_uid=user.firebase_uid)
    db.add(request)
    db.flush()

    # Affiliate program: the code from a /r/<code> link or typed in ties
    # the requester's phone to the affiliate (the first referral wins;
    # an unknown code is just kept on the request for the team to see).
    affiliate = affiliates.active_by_code(db, request.referral_code)
    if affiliate is not None:
        affiliates.create_referral(
            db, affiliate, request.requester_phone, "request_form", name=request.requester_name
        )

    # notifyEventRequest (DAW-49): every active admin/manager gets an
    # in-app notification that opens the Event requests page, plus a push
    # to their phone. Committed first, so a push problem can't lose the
    # request.
    display_name = (
        request.requester_name
        or " ".join(p for p in (user.first_name, user.last_name) if p)
        or request.requester_phone
        or user.phone
        or user.email
    )
    title = "طلب مناسبة جديد"
    message = f'{display_name} يطلب فتح مناسبة: "{request.title}"'
    privileged = (
        db.query(models.User)
        .filter(
            models.User.role.in_([models.Role.admin, models.Role.manager]),
            models.User.is_active.is_(True),
        )
        .all()
    )
    for admin in privileged:
        db.add(
            models.Notification(
                type=models.NotificationType.event_update,
                title=title,
                message=message,
                is_read=False,
                target_user_email=admin.email,
                link=EVENT_REQUESTS_PATH,
            )
        )
    db.commit()
    db.refresh(request)
    for admin in privileged:
        if admin.id != user.id:
            send_push_to_user(db, admin, title, message, data={"path": EVENT_REQUESTS_PATH})
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
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.EventRequest:
    """Flow C step 4: mark handled (approved) or rejected, with notes."""
    request = db.get(models.EventRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Event request not found")
    fields = body.model_dump(exclude_unset=True)
    before = snapshot(request, fields)
    for field, value in fields.items():
        setattr(request, field, value)
    changes = changes_since(before, request)
    if changes:
        audit(
            db,
            user,
            "event_request.update",
            "event_request",
            request.id,
            label=request.title,
            changes=changes,
        )
    db.commit()
    db.refresh(request)
    return request
