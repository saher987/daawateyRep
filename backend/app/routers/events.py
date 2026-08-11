"""Events + invitation recipients.

Covers Flow A (host creates and sends invitations), Flow D (event owner
manages their event), and the public half of Flow B (guest opens the
invitation link and RSVPs) — see BUSINESS_LOGIC.md and spec §7.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user, require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["events"])


def _is_owner_or_manager(event: models.Event, user: models.User) -> bool:
    return user.email in event.owner_emails or user.email in event.manager_emails


def _require_event_access(event: models.Event, user: models.User) -> None:
    """admin/manager: full access to every event. Everyone else: only if
    they're listed as an owner or manager on this specific event — the
    per-row rule from spec §1's role table."""
    if user.role in (models.Role.admin, models.Role.manager):
        return
    if _is_owner_or_manager(event, user):
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized for this event")


def _get_event_or_404(db: Session, event_id: str) -> models.Event:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.post("/events", response_model=schemas.EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    body: schemas.EventCreate,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.Event:
    """Flow A step 1: admin/manager creates an event; starts in `draft`."""
    event = models.Event(**body.model_dump(), created_by_uid=user.firebase_uid)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/events", response_model=list[schemas.EventOut])
def list_events(
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[models.Event]:
    """Admin/manager see every event (spec §1)."""
    return list(db.query(models.Event).order_by(models.Event.created_at.desc()).all())


@router.get("/my-events", response_model=list[schemas.EventOut])
def list_my_events(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.Event]:
    """Flow D: the "My Event" page — events where the signed-in user is
    listed as an owner or manager."""
    events = db.query(models.Event).order_by(models.Event.created_at.desc()).all()
    return [e for e in events if _is_owner_or_manager(e, user)]


@router.get("/events/{event_id}", response_model=schemas.EventOut)
def get_event(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Event:
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    return event


@router.put("/events/{event_id}", response_model=schemas.EventOut)
def update_event(
    event_id: str,
    body: schemas.EventUpdate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Event:
    """Flow D step 4: edit event details via the edit dialog. Same
    permission rule as viewing it."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.post("/events/{event_id}/activate", response_model=schemas.EventOut)
def activate_event(
    event_id: str,
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.Event:
    """Flow A step 5: draft → active. Invitation links become shareable."""
    event = _get_event_or_404(db, event_id)
    if event.status != models.EventStatus.draft:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"Event is already {event.status.value}"
        )
    event.status = models.EventStatus.active
    db.commit()
    db.refresh(event)
    return event


@router.get("/events/{event_id}/stats", response_model=schemas.EventStats)
def event_stats(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.EventStats:
    """Flow D step 2: live RSVP stats (total/accepted/declined/pending)."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    rows = (
        db.query(models.InvitationRecipient.rsvp_status, func.count())
        .filter(models.InvitationRecipient.event_id == event_id)
        .group_by(models.InvitationRecipient.rsvp_status)
        .all()
    )
    counts = {rsvp_status.value: count for rsvp_status, count in rows}
    return schemas.EventStats(
        total=sum(counts.values()),
        accepted=counts.get(models.RsvpStatus.accepted.value, 0),
        declined=counts.get(models.RsvpStatus.declined.value, 0),
        pending=counts.get(models.RsvpStatus.pending.value, 0),
    )


@router.post(
    "/events/{event_id}/recipients",
    response_model=schemas.RecipientOut,
    status_code=status.HTTP_201_CREATED,
)
def add_recipient(
    event_id: str,
    body: schemas.RecipientCreate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.InvitationRecipient:
    """Flow A step 4 / createInvitationRecipient: add an invitee, who gets a
    unique personal_token (assigned by the model's column default)."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    recipient = models.InvitationRecipient(
        event_id=event_id,
        event_creator_id=event.created_by_uid,
        **body.model_dump(),
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    return recipient


@router.get("/events/{event_id}/recipients", response_model=list[schemas.RecipientOut])
def list_recipients(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.InvitationRecipient]:
    """getEventRecipients (spec §5): the guest list behind Flow D's
    search/filter/export — same per-event access rule as everything else."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    return list(
        db.query(models.InvitationRecipient)
        .filter(models.InvitationRecipient.event_id == event_id)
        .order_by(models.InvitationRecipient.created_at)
        .all()
    )


# --- Public invitation flow (Flow B) — looked up by token, no auth at all ---


def _to_public_invitation(recipient: models.InvitationRecipient) -> schemas.PublicInvitationOut:
    event = recipient.event
    venue = event.venue
    return schemas.PublicInvitationOut(
        event_title=event.title,
        event_type=event.type,
        event_date=event.date,
        venue_name=venue.name if venue else None,
        venue_address=venue.address if venue else None,
        venue_map_url=venue.map_url if venue else None,
        cover_image_url=event.cover_image_url,
        invitation_image_url=event.invitation_image_url,
        greeting=event.greeting,
        recipient_first_name=recipient.first_name,
        rsvp_status=recipient.rsvp_status,
        rsvp_guests_count=recipient.rsvp_guests_count,
    )


def _get_recipient_by_token_or_404(db: Session, token: str) -> models.InvitationRecipient:
    recipient = (
        db.query(models.InvitationRecipient)
        .filter(models.InvitationRecipient.personal_token == token)
        .one_or_none()
    )
    if recipient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    return recipient


@router.get("/invitations/{token}", response_model=schemas.PublicInvitationOut)
def get_invitation_by_token(token: str, db: Session = Depends(get_db)) -> schemas.PublicInvitationOut:
    """getInvitationByToken (spec §5): the public /i/:token page. Marks the
    recipient as opened, exactly like Flow B step 2 — but returns only the
    fields a guest is meant to see, never the full row."""
    recipient = _get_recipient_by_token_or_404(db, token)
    if recipient.opened_at is None:
        recipient.opened_at = datetime.now(timezone.utc)
        recipient.status = "opened"
        db.commit()
        db.refresh(recipient)
    return _to_public_invitation(recipient)


@router.post("/invitations/{token}/rsvp", response_model=schemas.PublicInvitationOut)
def submit_rsvp(
    token: str, body: schemas.RsvpSubmit, db: Session = Depends(get_db)
) -> schemas.PublicInvitationOut:
    """submitRsvp (spec §5, Flow B step 4). Base44 let a guest change their
    answer once — that limit is UI-enforced there and stays UI-enforced
    here; the API itself just records whatever the frontend submits."""
    recipient = _get_recipient_by_token_or_404(db, token)
    recipient.rsvp_status = body.rsvp_status
    recipient.rsvp_guests_count = body.rsvp_guests_count
    recipient.rsvp_message = body.rsvp_message
    db.commit()
    db.refresh(recipient)
    return _to_public_invitation(recipient)
