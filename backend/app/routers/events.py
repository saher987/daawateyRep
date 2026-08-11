"""Events + invitation recipients.

Covers Flow A (host creates and sends invitations), Flow D (event owner
manages their event), and the public half of Flow B (guest opens the
invitation link and RSVPs) — see BUSINESS_LOGIC.md and the original
createInvitationRecipient/getInvitationByToken/submitRsvp functions this
was ported from.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
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
    per-row rule from the original Event entity's implicit RLS."""
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
    """Admin/manager see every event."""
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


@router.get("/recipients", response_model=list[schemas.RecipientOut])
def list_all_recipients(
    limit: int = 500,
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[models.InvitationRecipient]:
    """Cross-event guest list (Invitees.jsx) + Dashboard.jsx's recent-
    activity feed. Unlike GET /api/events/{id}/recipients, this isn't
    scoped to one event — admin/manager only, same as GET /api/events."""
    return list(
        db.query(models.InvitationRecipient)
        .order_by(models.InvitationRecipient.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/my-invitations", response_model=list[schemas.MyInvitationOut])
def list_my_invitations(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[schemas.MyInvitationOut]:
    """The "/" home route (MyInvitations page): every invitation addressed
    to the signed-in guest, matched by phone, email, or a linked user_id —
    the same match the original InvitationRecipient entity's read RLS used.
    Deliberately returns a denormalized event subset rather than the full
    Event row, since a guest recipient isn't necessarily an owner/manager
    of that event and shouldn't need to be to see their own invitation."""
    conditions = [models.InvitationRecipient.user_id == user.id]
    if user.phone:
        conditions.append(models.InvitationRecipient.phone == user.phone)
    if user.email:
        conditions.append(models.InvitationRecipient.email == user.email)
    recipients = db.query(models.InvitationRecipient).filter(or_(*conditions)).all()
    return [
        schemas.MyInvitationOut(
            recipient=schemas.MyInvitationRecipientOut.model_validate(r),
            event=schemas.MyInvitationEventOut.model_validate(r.event),
        )
        for r in recipients
        if r.event is not None
    ]


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


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str,
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> None:
    """spec §1: admin and manager can both delete events (unlike venues/
    planned-weddings, which are admin-only-delete)."""
    event = _get_event_or_404(db, event_id)
    db.delete(event)
    db.commit()


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
    """Flow D step 2: live RSVP stats (total/accepted/declined/maybe/pending)."""
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
        maybe=counts.get(models.RsvpStatus.maybe.value, 0),
        pending=counts.get(models.RsvpStatus.pending.value, 0),
    )


def _resolve_display_name(
    external_full_name: str | None,
    nickname: str | None,
    first_name: str | None,
    last_name: str | None,
) -> str | None:
    """Same fallback chain the original used everywhere it needed a
    recipient's display name: external_full_name first, else assembled
    from nickname/first/last."""
    if external_full_name:
        return external_full_name
    parts = [p for p in (nickname, first_name, last_name) if p]
    return " ".join(parts) if parts else None


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
    unique personal_token (assigned by the model's column default). Rejects
    a duplicate phone or email already invited to this event, same as the
    original."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)

    if not body.phone and not body.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="phone or email is required")

    duplicate_query = db.query(models.InvitationRecipient).filter(
        models.InvitationRecipient.event_id == event_id
    )
    if body.phone:
        duplicate_query = duplicate_query.filter(models.InvitationRecipient.phone == body.phone)
    else:
        duplicate_query = duplicate_query.filter(models.InvitationRecipient.email == body.email)
    if duplicate_query.first() is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="A recipient with this phone/email is already invited to this event",
        )

    linked_user_id = body.user_id
    if not linked_user_id and body.phone:
        matched = db.query(models.User).filter(models.User.phone == body.phone).first()
        if matched is not None:
            linked_user_id = matched.id

    recipient = models.InvitationRecipient(
        event_id=event_id,
        event_creator_id=event.created_by_uid,
        user_id=linked_user_id,
        external_full_name=body.external_full_name,
        nickname=body.nickname,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        email=body.email,
        guests_count=body.guests_count,
        group_label=body.group_label,
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    # TODO(Phase 6): send the invitation SMS (Pulseem) / email (Resend) here,
    # same as the original — not wired up yet.
    return recipient


@router.get("/events/{event_id}/recipients", response_model=list[schemas.RecipientOut])
def list_recipients(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.InvitationRecipient]:
    """getEventRecipients: the guest list behind Flow D's search/filter/
    export — same per-event access rule as everything else."""
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
    return schemas.PublicInvitationOut(
        recipient_id=recipient.id,
        event_title=event.title,
        event_type=event.event_type.value,
        event_date=event.date,
        venue_name=event.venue_name,
        venue_city=event.venue_city,
        venue_address=event.venue_address,
        venue_map_url=event.venue_map_url,
        cover_image_url=event.cover_image_url,
        invitation_image_url=event.invitation_image_url,
        invitation_greeting=event.invitation_greeting,
        invitation_greeting_he=event.invitation_greeting_he,
        description=event.description,
        groom_name=event.groom_name,
        bride_name=event.bride_name,
        theme_color=event.theme_color,
        display_name=_resolve_display_name(
            recipient.external_full_name,
            recipient.nickname,
            recipient.first_name,
            recipient.last_name,
        ),
        rsvp_status=recipient.rsvp_status,
        rsvp_guests_count=recipient.rsvp_guests_count,
        invited_guests_count=recipient.guests_count,
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
    """getInvitationByToken: the public /i/:token page. Tracks opens exactly
    like the original — first_opened_at set once, last_opened_at + open_count
    updated every time, status advances pending/sent → opened — but returns
    only the fields a guest is meant to see, never the full row."""
    recipient = _get_recipient_by_token_or_404(db, token)
    now = datetime.now(timezone.utc)
    if recipient.first_opened_at is None:
        recipient.first_opened_at = now
    recipient.last_opened_at = now
    recipient.open_count += 1
    if recipient.status in (models.RecipientStatus.pending, models.RecipientStatus.sent):
        recipient.status = models.RecipientStatus.opened
    db.commit()
    db.refresh(recipient)
    return _to_public_invitation(recipient)


def _apply_rsvp(recipient: models.InvitationRecipient, body: schemas.RsvpSubmit) -> None:
    """submitRsvp: same server-side rule the original enforced — guest count
    is only ever recorded for an 'accepted' RSVP (defaulting to 1), zeroed
    out for declined/maybe regardless of what the client sends, since a
    'how many are coming' number is meaningless otherwise."""
    recipient.rsvp_status = body.rsvp_status
    recipient.rsvp_guests_count = (
        (body.guests_count or 1) if body.rsvp_status == models.RsvpStatus.accepted else 0
    )
    recipient.rsvp_message = body.message
    recipient.rsvp_date = datetime.now(timezone.utc)
    recipient.status = models.RecipientStatus.responded
    # TODO(Phase 6): notify the event's owners/managers on decline, same as
    # the original's notifyEventUpdate-adjacent logic — not wired up yet.


@router.post("/invitations/{token}/rsvp", response_model=schemas.PublicInvitationOut)
def submit_rsvp(
    token: str, body: schemas.RsvpSubmit, db: Session = Depends(get_db)
) -> schemas.PublicInvitationOut:
    recipient = _get_recipient_by_token_or_404(db, token)
    _apply_rsvp(recipient, body)
    db.commit()
    db.refresh(recipient)
    return _to_public_invitation(recipient)


@router.post("/invitation-recipients/{recipient_id}/rsvp", response_model=schemas.PublicInvitationOut)
def submit_rsvp_by_recipient_id(
    recipient_id: str, body: schemas.RsvpSubmit, db: Session = Depends(get_db)
) -> schemas.PublicInvitationOut:
    """Same as above, keyed by recipient id instead of token — this is the
    one the actual ported frontend calls (the original's submitRsvp takes a
    recipientId, sourced from getInvitationByToken's response, not the
    token itself). No auth: a recipient id is a random UUID, as
    unguessable as the personal_token, so this is no less safe than the
    token-keyed route above."""
    recipient = db.get(models.InvitationRecipient, recipient_id)
    if recipient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    _apply_rsvp(recipient, body)
    db.commit()
    db.refresh(recipient)
    return _to_public_invitation(recipient)
