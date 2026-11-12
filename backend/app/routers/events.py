"""Events + invitation recipients.

Covers Flow A (host creates and sends invitations), Flow D (event owner
manages their event), and the public half of Flow B (guest opens the
invitation link and RSVPs) — see BUSINESS_LOGIC.md and the original
createInvitationRecipient/getInvitationByToken/submitRsvp functions this
was ported from.
"""

import os
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, object_session

from app import models, schemas
from app.audit import audit, changes_since, snapshot
from app.auth import get_app_user, require_role
from app.db import get_db
from app.integrations.push import send_push_to_user
from app.integrations.pulseem import find_by_phone, send_sms, to_international_phone
from app.routers.venues import owned_venues
from app.integrations.resend_email import send_email
from app.integrations.whatsapp import (
    invitation_channel_for,
    send_whatsapp_template,
    universal_template_enabled,
)

router = APIRouter(prefix="/api", tags=["events"])


def _is_owner_or_manager(event: models.Event, user: models.User) -> bool:
    # Normalize both sides — owner_phones/manager_phones are stored
    # normalized (see create_event/update_event), but user.phone is
    # whatever raw format was typed during OTP verification (see
    # otp.py), so comparing it as-is would reintroduce the exact
    # "05... never matches +972 5..." bug class this whole switch from
    # email to phone was meant to close for good.
    if not user.phone:
        return False
    normalized = to_international_phone(user.phone)
    return normalized in event.owner_phones or normalized in event.manager_phones


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
    data = body.model_dump()
    # Store normalized so _is_owner_or_manager's own normalization of
    # user.phone actually lands on an equal string, and so
    # .any(to_international_phone(...)) SQL lookups (list_venue_events)
    # work the same way without a per-row Python fallback scan.
    data["owner_phones"] = [to_international_phone(p) for p in data["owner_phones"]]
    data["manager_phones"] = [to_international_phone(p) for p in data["manager_phones"]]
    event = models.Event(**data, created_by_uid=user.firebase_uid)
    db.add(event)
    db.flush()
    audit(db, user, "event.create", "event", event.id, label=event.title)
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


@router.get("/venue-events", response_model=list[schemas.EventOut])
def list_venue_events(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.Event]:
    """Flow E: powers the venue calendar (VenueSchedule.jsx for admin/
    venue_owner, VenueMonthCalendar on MyVenueDetail.jsx) — every active/
    draft event, scoped to the venues the caller can see. admin/manager get
    everything, same as the original's unrestricted query; anyone else gets
    only events at venues where they're listed in owner_phones (whatever
    their role, see venues.owned_venues), enforced
    here server-side (the original relied on Base44's per-row RLS for this
    — VenueSchedule.jsx's client-side `.filter(...)` by owner_phones was
    always a redundant belt-and-suspenders check against data Base44 had
    already scoped, not the actual enforcement).

    Matches events to a venue_owner's venues by *either* venue_id or the
    denormalized venue_name text, exactly like the ported pages do — an
    event doesn't have to reference a real Venue row (inline venue text is
    still valid), so venue_name is the only link for those."""
    query = db.query(models.Event).filter(
        models.Event.status.in_([models.EventStatus.active, models.EventStatus.draft])
    )
    if user.role not in (models.Role.admin, models.Role.manager):
        # Anyone listed in a venue's owner_phones, whatever their role.
        my_venues = owned_venues(db, user)
        if not my_venues:
            return []
        venue_ids = [v.id for v in my_venues]
        venue_names = [v.name for v in my_venues]
        query = query.filter(
            or_(models.Event.venue_id.in_(venue_ids), models.Event.venue_name.in_(venue_names))
        )
    return list(query.order_by(models.Event.date).all())


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
    if user.email:
        conditions.append(models.InvitationRecipient.email == user.email)
    if user.phone:
        conditions.append(models.InvitationRecipient.phone == user.phone)
    recipients = {r.id: r for r in db.query(models.InvitationRecipient).filter(or_(*conditions)).all()}

    # The exact phone == comparison above misses format differences (host
    # typed "05..." while this account's phone is stored "+972 5..." from
    # OTP verification, or vice versa) — same bug class fixed in
    # add_recipient's own account-linking lookup. Without this fallback, a
    # guest whose account phone format didn't happen to match at invite-
    # creation time only ever saw their invitation *after* opening the
    # personal link once (which does use tolerant matching, via otp.py) —
    # exactly the "see it before opening the link" gap this closes.
    if user.phone:
        normalized = to_international_phone(user.phone)
        for r in db.query(models.InvitationRecipient).filter(
            models.InvitationRecipient.phone.isnot(None)
        ):
            if r.id not in recipients and to_international_phone(r.phone) == normalized:
                recipients[r.id] = r

    return [
        schemas.MyInvitationOut(
            recipient=schemas.MyInvitationRecipientOut.model_validate(r),
            event=schemas.MyInvitationEventOut.model_validate(r.event),
        )
        for r in recipients.values()
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


# Fields only admin/manager may change on PUT /events/{id} (update_event).
_TEAM_ONLY_EVENT_FIELDS = ("seating_enabled", "checkin_enabled", "owner_phones", "manager_phones")


def _same_value(current, new) -> bool:
    """Phone lists compare as sets (order and duplicates don't matter)."""
    if isinstance(current, list) or isinstance(new, list):
        return set(current or []) == set(new or [])
    return bool(current) == bool(new) if isinstance(new, bool) else current == new


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
    fields = body.model_dump(exclude_unset=True)
    for field in ("owner_phones", "manager_phones"):
        # Same normalization as create_event, for the same reason —
        # otherwise an edit that only touches owner_phones/manager_phones
        # could silently un-normalize a previously-correct entry.
        if fields.get(field) is not None:
            fields[field] = [to_international_phone(p) for p in fields[field]]
    if user.role not in (models.Role.admin, models.Role.manager):
        # Event owners/managers edit their own event's details, but which
        # paid services it has (seating, check-in) and who owns or manages
        # it are set by the team. The edit dialogs still send unchanged
        # values back, so only an actual change is refused.
        for field in _TEAM_ONLY_EVENT_FIELDS:
            if field in fields and not _same_value(getattr(event, field), fields[field]):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Only the Daawatey team can change {field}")
    before = snapshot(event, fields)
    for field, value in fields.items():
        setattr(event, field, value)
    changes = changes_since(before, event)
    if changes:
        audit(db, user, "event.update", "event", event.id, label=event.title, changes=changes)
    db.commit()
    db.refresh(event)
    return event


@router.post("/events/{event_id}/notify-update")
def notify_event_update(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> dict:
    """notifyEventUpdate: EditEventDialog.jsx already computes whether the
    date/venue/description actually changed and calls this right after a
    successful save when they did — was an unimplemented base44Client.js
    stub, so saving an edited event never actually told anyone. Sends the
    same SMS/email channels the original did to every recipient (whichever
    they have — phone, email, or both), plus a real in-app Notification for
    each (see _notify_recipient_in_app — genuinely new, the original never
    had this in-app)."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)

    app_url = os.environ.get("APP_URL", "https://daawatey.com")
    sms_sent = 0
    email_sent = 0
    recipients = (
        db.query(models.InvitationRecipient)
        .filter(models.InvitationRecipient.event_id == event_id)
        .all()
    )
    for recipient in recipients:
        invitation_link = f"{app_url}/i/{recipient.personal_token}"
        invitee_name = _resolve_display_name(
            recipient.external_full_name,
            recipient.nickname,
            recipient.first_name,
            recipient.last_name,
            recipient.name_suffix,
        ) or (recipient.phone or recipient.email or "")

        if recipient.phone:
            text = f"حضرة {invitee_name}، تم تحديث تفاصيل مناسبة {event.title}. {invitation_link}"
            if send_sms(recipient.phone, text, reference=recipient.id):
                sms_sent += 1

        if recipient.email:
            html = (
                f'<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; '
                f'margin: 0 auto; padding: 20px;">'
                f"<p>حضرة {invitee_name}، تم تحديث تفاصيل مناسبة {event.title}.</p>"
                f'<p><a href="{invitation_link}" style="display: inline-block; background: '
                f'{event.theme_color}; color: white; padding: 12px 24px; text-decoration: none; '
                f'border-radius: 8px; margin: 16px 0;">عرض التفاصيل المحدثة</a></p>'
                f'<p style="color: #888; font-size: 12px;">{invitation_link}</p></div>'
            )
            if send_email(recipient.email, f"تحديث على مناسبة {event.title}", html):
                email_sent += 1

        _notify_recipient_in_app(
            db,
            recipient,
            title="تحديث على المناسبة",
            message=f'تم تحديث تفاصيل مناسبة "{event.title}"',
            event_id=event.id,
        )

    audit(
        db,
        user,
        "event.notify_update",
        "event",
        event.id,
        label=event.title,
        meta={"recipients": len(recipients), "sms_sent": sms_sent, "email_sent": email_sent},
    )
    db.commit()
    return {"success": True, "smsSent": sms_sent, "emailSent": email_sent}


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> None:
    """spec §1: admin and manager can both delete events (unlike venues/
    planned-weddings, which are admin-only-delete)."""
    event = _get_event_or_404(db, event_id)
    audit(
        db,
        user,
        "event.delete",
        "event",
        event.id,
        label=event.title,
        meta={"status": event.status, "date": event.date},
    )
    db.delete(event)
    db.commit()


@router.post("/events/{event_id}/activate", response_model=schemas.EventOut)
def activate_event(
    event_id: str,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.Event:
    """Flow A step 5: draft → active. Invitation links become shareable."""
    event = _get_event_or_404(db, event_id)
    if event.status != models.EventStatus.draft:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"Event is already {event.status.value}"
        )
    event.status = models.EventStatus.active
    audit(db, user, "event.activate", "event", event.id, label=event.title)
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
    name_suffix: str | None = None,
) -> str | None:
    """A recipient's display name, always led by their nickname/title
    (e.g. "السيد ساهر خنيفس") when one was given. Used to prefer
    external_full_name outright, but AddInviteeDialog fills that for an
    existing user from full_name/first+last *without* the nickname — so
    the SMS greeting dropped it ("حضرة ساهر خنيفس"). Now the structured
    nickname/first/last wins whenever a first or last name exists;
    external_full_name is only the fallback, with the nickname prepended
    if it isn't already there. name_suffix ("وعائلته") is appended last
    either way."""
    nickname = (nickname or "").strip() or None
    name_suffix = (name_suffix or "").strip() or None
    if first_name or last_name:
        name = " ".join(p for p in (nickname, first_name, last_name) if p)
    elif external_full_name:
        if nickname and not external_full_name.startswith(nickname):
            name = f"{nickname} {external_full_name}"
        else:
            name = external_full_name
    else:
        name = nickname
    if name and name_suffix:
        return f"{name} {name_suffix}"
    return name


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
    return _add_and_invite(db, event, user, body)


def _add_and_invite(
    db: Session,
    event: models.Event,
    user: models.User,
    body: schemas.RecipientCreate,
    *,
    batch: bool = False,
) -> models.InvitationRecipient:
    """Adds one guest to the event and sends their invitation: the single
    add (add_recipient) and the import page's batch send
    (import_invitations_batch). Raises 400 without a phone/email and 409
    when that phone/email is already invited to this event."""

    if not body.phone and not body.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="phone or email is required")

    duplicate_query = db.query(models.InvitationRecipient).filter(
        models.InvitationRecipient.event_id == event.id
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
        # Plain == would miss e.g. "050..." vs. the "972050..." format
        # otp.py actually stores on users.phone — same tolerant match otp.py
        # itself uses, needed here so a recipient typed in with a
        # differently-formatted (but same) number still gets linked to
        # their real account (Notification email fallback still works
        # either way, but push and My Invitations' account link don't).
        matched = find_by_phone(db, models.User, body.phone)
        if matched is not None:
            linked_user_id = matched.id

    recipient = models.InvitationRecipient(
        event_id=event.id,
        event_creator_id=event.created_by_uid,
        user_id=linked_user_id,
        external_full_name=body.external_full_name,
        nickname=body.nickname,
        first_name=body.first_name,
        last_name=body.last_name,
        name_suffix=body.name_suffix,
        phone=body.phone,
        email=body.email,
        guests_count=body.guests_count,
        side=body.side,
        group_label=(body.group_label or "").strip() or None,
        town=body.town,
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    if _send_invitation(event, recipient, invited_by=user):
        recipient.sent_count = (recipient.sent_count or 0) + 1
    _notify_recipient_in_app(
        db,
        recipient,
        title="دعوة جديدة",
        message=f'تمت دعوتك لحضور "{event.title}"',
        event_id=event.id,
        # Only the actual invite gets a real push, not every later
        # event_update — a push is a much more attention-grabbing channel
        # than the polled in-app bell, worth reserving for "you were
        # invited" specifically rather than every detail edit.
        send_push=True,
    )
    audit(
        db,
        user,
        "recipient.add",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta={
            "event_id": event.id,
            "event_title": event.title,
            "sent": bool(recipient.sent_count),
            **({"batch": True} if batch else {}),
        },
    )
    db.commit()
    return recipient




def _notify_recipient_in_app(
    db: Session,
    recipient: models.InvitationRecipient,
    *,
    title: str,
    message: str,
    event_id: str,
    send_push: bool = False,
) -> None:
    """In-app Notification (bell icon, /notifications) for a recipient —
    genuinely new: the original app never surfaced invite/update events
    in-app, only via SMS/email (see notifyEventUpdate in the ground truth,
    which sends neither). Added per explicit request: this is *in addition
    to* the SMS/email _send_invitation already sends, not a replacement.

    Notification.target_user_email is required and isn't a foreign key —
    same lazy-match pattern as pending_invites: if the recipient is already
    linked to a registered account (recipient.user_id, matched by phone at
    creation time), target that account's real email; otherwise fall back
    to whatever email the recipient itself was given, which becomes
    visible the moment they eventually sign in with it (get_app_user
    creates their row lazily either way). A phone-only recipient with no
    linked account yet has no email to target at all — no in-app
    notification is possible for them until one of those becomes true;
    SMS remains their only channel until then, which is what
    _send_invitation already covers.

    send_push (2026-09): a real FCM push on top of the in-app row, gated
    on the same "is there a linked, registered account" condition — no
    account means no device token to push to either way. Only set True for
    the actual invite (add_recipient), not every later event_update; the
    data payload's `path` is what PhoneOtpLogin.jsx-adjacent native/web tap
    handlers navigate to, landing on /i/<token> so the existing
    open/RSVP-tracking in InvitationPage.jsx's own query fires exactly as
    it does for a guest who tapped the SMS link directly.

    Doesn't commit — callers batch this with their own commit (add_recipient
    already committed the recipient; notify_event_update batches all
    recipients in one commit at the end)."""
    linked_user = db.get(models.User, recipient.user_id) if recipient.user_id else None

    target_email = linked_user.email if linked_user is not None else recipient.email
    if target_email:
        db.add(
            models.Notification(
                # No NotificationType value maps to "you were invited"/
                # "event you're invited to changed" specifically (see
                # NotificationType — the original never had this feature to
                # name a type after). event_update reads close enough, and
                # Notifications.jsx never renders type-specific icon/copy
                # anyway — only title/message.
                type=models.NotificationType.event_update,
                title=title,
                message=message,
                is_read=False,
                target_user_email=target_email,
                event_id=event_id,
                recipient_id=recipient.id,
            )
        )

    if send_push and linked_user is not None:
        send_push_to_user(
            db,
            linked_user,
            title=title,
            body=message,
            data={"path": f"/i/{recipient.personal_token}"},
        )


def _send_invitation(
    event: models.Event, recipient: models.InvitationRecipient, invited_by: models.User
) -> bool:
    """sendInvitationSms + the email half of createInvitationRecipient:
    SMS via Pulseem (or WhatsApp, per INVITATION_CHANNEL) if a phone was
    given, email via Resend if an email was
    given — same templates as the original, both degrading to a logged
    warning (not an error) if their API key isn't configured, since a
    recipient should still get created either way.

    add_recipient (above) fires-and-forgets this — never fails creation
    just because delivery failed. resend_invitation (below) cares about
    the return value: resending *is* the whole point of that action, so
    its caller needs to know whether anything actually went out. Returns
    True if at least one channel (of whichever the recipient has) sent
    successfully."""
    invitee_name, invitor_name, invitation_link = _invitation_parts(event, recipient, invited_by)
    sent = False

    if recipient.phone:
        # INVITATION_CHANNEL (whatsapp.py) picks SMS, WhatsApp, or WhatsApp
        # with SMS as the fallback when Meta rejects the send outright.
        channel = invitation_channel_for(recipient.phone)
        whatsapp_sent = False
        if channel in ("whatsapp", "whatsapp_then_sms"):
            template_key, body_values = _whatsapp_invitation(event, invitee_name, invitor_name)
            whatsapp_sent = send_whatsapp_template(
                recipient.phone,
                template_key,
                body_values,
                # "invite-" tells the webhook this one gets the SMS fallback
                # if Meta later reports it undelivered.
                reference=f"invite-{recipient.id}",
                personal_token=recipient.personal_token,
            )
            sent = whatsapp_sent or sent
        if channel == "sms" or (channel == "whatsapp_then_sms" and not whatsapp_sent):
            text = _invitation_sms_text(event, invitee_name, invitor_name, invitation_link)
            sent = send_sms(recipient.phone, text, reference=recipient.id) or sent

    if recipient.email:
        body_text = event.invitation_greeting or f"تمت دعوتكم من {invitor_name} لحضور {event.title}."
        html = (
            f'<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; '
            f'margin: 0 auto; padding: 20px;">'
            f"<p>حضرة {invitee_name}، {body_text}</p>"
            f'<p><a href="{invitation_link}" style="display: inline-block; background: '
            f'{event.theme_color}; color: white; padding: 12px 24px; text-decoration: none; '
            f'border-radius: 8px; margin: 16px 0;">عرض الدعوة</a></p>'
            f'<p style="color: #888; font-size: 12px;">{invitation_link}</p></div>'
        )
        sent = send_email(recipient.email, f"دعوة لحضور {event.title}", html) or sent

    return sent


def _invitation_parts(
    event: models.Event, recipient: models.InvitationRecipient, invited_by: models.User | None
) -> tuple[str, str, str]:
    """The guest's display name, the inviter's name and the guest's
    invitation link, as every invitation channel words them."""
    app_url = os.environ.get("APP_URL", "https://daawatey.com")
    invitation_link = f"{app_url}/i/{recipient.personal_token}"
    invitee_name = _resolve_display_name(
        recipient.external_full_name,
        recipient.nickname,
        recipient.first_name,
        recipient.last_name,
        recipient.name_suffix,
    ) or (recipient.phone or recipient.email or "")
    # The event's host, not whoever is signed in: an admin adding guests to
    # a client's event shouldn't appear as the one inviting them. The
    # adding user's name is only the fallback for events with no host_name.
    invitor_name = (event.host_name or "").strip()
    if not invitor_name and invited_by is not None:
        invitor_name = (
            " ".join(p for p in (invited_by.nickname, invited_by.first_name, invited_by.last_name) if p)
            or invited_by.email
            or ""
        )
    return invitee_name, invitor_name or "المنظم", invitation_link


def _invitation_sms_text(event: models.Event, invitee_name: str, invitor_name: str, invitation_link: str) -> str:
    if event.invitation_greeting:
        return f"حضرة {invitee_name}، {event.invitation_greeting} {invitation_link}"
    return f"حضرة {invitee_name}، تمت دعوتكم من {invitor_name} لحضور {event.title}. {invitation_link}"


def send_invitation_sms_fallback(db: Session, recipient_id: str, wamid: str | None) -> bool:
    """Called by the WhatsApp webhook (routers/whatsapp_webhook.py) when
    Meta reports a WhatsApp invitation it had accepted as undelivered
    (e.g. 131049, its marketing-message limit): the guest gets the SMS
    invitation instead, as they would have if the send itself had failed.

    Only under INVITATION_CHANNEL=whatsapp_then_sms, and at most once per
    failed WhatsApp message (sms_fallback_wamid), since Meta can deliver
    the same webhook more than once. Returns whether an SMS went out."""
    recipient = db.get(models.InvitationRecipient, recipient_id)
    if recipient is None or not recipient.phone:
        return False
    if invitation_channel_for(recipient.phone) != "whatsapp_then_sms":
        return False
    if wamid and recipient.sms_fallback_wamid == wamid:
        return False
    event = recipient.event
    creator = (
        db.query(models.User).filter(models.User.firebase_uid == event.created_by_uid).first()
        if event.created_by_uid
        else None
    )
    invitee_name, invitor_name, invitation_link = _invitation_parts(event, recipient, creator)
    text = _invitation_sms_text(event, invitee_name, invitor_name, invitation_link)
    sent = send_sms(recipient.phone, text, reference=recipient.id)
    recipient.sms_fallback_wamid = wamid
    audit(
        db,
        None,
        "recipient.whatsapp_sms_fallback",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta={"event_id": event.id, "event_title": event.title, "wamid": wamid, "sent": sent},
    )
    db.commit()
    return sent


def _whatsapp_invitation(
    event: models.Event, invitee_name: str, invitor_name: str
) -> tuple[str, list[str]]:
    """Which WhatsApp template (integrations/whatsapp.py) an invitation to
    this event uses, and its body variables in template order.

    With the universal template (the default) {{2}} is the event's WhatsApp
    text (whatsapp_invitation_text), or a short default sentence when none
    was written — changing it needs no new template review. The SMS/email
    text (invitation_greeting) is never sent over WhatsApp there."""
    whatsapp_text = (event.whatsapp_invitation_text or "").strip()
    if universal_template_enabled():
        return "universal", [invitee_name, whatsapp_text or f"يدعوكم {invitor_name} لحضور {event.title}."]
    # Per-type templates (universal off): the old custom template still
    # takes the SMS greeting for events without a WhatsApp text of their own.
    custom_text = whatsapp_text or (event.invitation_greeting or "").strip()
    if custom_text:
        return "custom", [invitee_name, custom_text]
    return "default", [invitee_name, invitor_name, event.title]


def _get_recipient_or_404(db: Session, recipient_id: str) -> models.InvitationRecipient:
    recipient = db.get(models.InvitationRecipient, recipient_id)
    if recipient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Recipient not found")
    return recipient


def _recipient_label(recipient: models.InvitationRecipient) -> str:
    """Audit-log label for a guest: their name, never their full phone
    number (guests aren't app users and never agreed to be in this log)."""
    name = _resolve_display_name(
        recipient.external_full_name,
        recipient.nickname,
        recipient.first_name,
        recipient.last_name,
        recipient.name_suffix,
    )
    if name:
        return name
    if recipient.phone:
        return f"…{recipient.phone[-4:]}"
    return recipient.email or recipient.id


@router.delete("/invitation-recipients/{recipient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipient(
    recipient_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> None:
    """InviteeRow.jsx's delete button — previously had no backend endpoint
    at all (the frontend called InvitationRecipient.delete(), which
    base44Client.js's shim never mapped anywhere, so it silently
    TypeError'd). Same access rule as everything else on this event: only
    an owner/manager of the event this recipient belongs to, or admin/
    manager generally."""
    recipient = _get_recipient_or_404(db, recipient_id)
    _require_event_access(recipient.event, user)
    audit(
        db,
        user,
        "recipient.delete",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta={"event_id": recipient.event_id, "event_title": recipient.event.title},
    )
    db.delete(recipient)
    db.commit()


@router.post("/invitation-recipients/{recipient_id}/resend")
def resend_invitation(
    recipient_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> dict:
    """sendInvitationSms in the original: InviteeRow.jsx's per-recipient
    resend button. Previously an unimplemented base44Client.js stub that
    always reported success without sending anything — now actually
    re-sends via the same templates/channels as the initial invite."""
    recipient = _get_recipient_or_404(db, recipient_id)
    event = recipient.event
    _require_event_access(event, user)
    sent = _send_invitation(event, recipient, invited_by=user)
    if sent:
        recipient.sent_count = (recipient.sent_count or 0) + 1
    audit(
        db,
        user,
        "recipient.resend",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta={"event_id": event.id, "event_title": event.title, "sent": sent},
    )
    db.commit()
    return {"success": sent}


@router.post("/invitation-recipients/{recipient_id}/send-thanks")
def send_thanks(
    recipient_id: str,
    body: schemas.ThankYouSend,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> dict:
    """ThankYouDialog.jsx's send button: thank an invitee who accepted.
    Admin/manager only — event owners don't get the button (EventDetails.jsx
    passes canResend={isPrivileged}), and each send is paid.

    Same channel rule as invitations (INVITATION_CHANNEL): over WhatsApp
    it's the fixed `thanks` template, its {{event_name}} / {{event_owners}}
    exactly as set in the event's two thank-you fields — never taken from
    the title / host name. Until both are set the thank-you goes by SMS:
    body.message, the event's hand-written thank-you already filled in for
    this guest by the frontend (also the fallback if WhatsApp fails)."""
    recipient = _get_recipient_or_404(db, recipient_id)
    error = _thanks_ineligible_reason(recipient)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=error)
    sent, used = _send_thanks_to(db, user, recipient, body.message)
    db.commit()
    return {"success": sent, "channel": used}


def _thanks_ineligible_reason(recipient: models.InvitationRecipient) -> str | None:
    if recipient.rsvp_status != models.RsvpStatus.accepted:
        return "Thank-you is only sent to guests who accepted"
    if not recipient.phone:
        return "Recipient has no phone number"
    return None


def _send_thanks_to(
    db: Session,
    user: models.User,
    recipient: models.InvitationRecipient,
    message: str,
    *,
    batch: bool = False,
) -> tuple[bool, str]:
    """Sends one guest's thank-you (channel rule in send_thanks) and adds
    its audit row. Doesn't commit — send_thanks commits per guest,
    send_thanks_batch once per batch. Sets the guest's thanked_at when it
    went out. Returns (sent, channel used)."""
    event = recipient.event
    channel = invitation_channel_for(recipient.phone)
    sent = False
    used = "sms"
    if channel in ("whatsapp", "whatsapp_then_sms"):
        values = {
            "event_name": (event.thank_you_event_name or "").strip(),
            "event_owners": (event.thank_you_event_owners or "").strip(),
        }
        if all(values.values()):
            sent = send_whatsapp_template(recipient.phone, "thanks", values, reference=f"thanks-{recipient.id}")
            used = "whatsapp" if sent else "sms"
            if sent:
                # Meta's 200 is only "accepted": kept for the webhook's
                # SMS fallback if it later reports the message undelivered.
                recipient.thanks_sms = message.strip()
    if not sent and channel in ("sms", "whatsapp_then_sms"):
        sent = send_sms(recipient.phone, message.strip(), reference=recipient.id)
    if sent:
        recipient.thanked_at = datetime.now(timezone.utc)
    meta = {"event_id": event.id, "event_title": event.title, "sent": sent, "channel": used}
    if batch:
        meta["batch"] = True
    audit(
        db,
        user,
        "recipient.send_thanks",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta=meta,
    )
    return sent, used


@router.post("/events/{event_id}/send-thanks-batch", response_model=schemas.ThankYouBatchResult)
def send_thanks_batch(
    event_id: str,
    body: schemas.ThankYouBatchSend,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> schemas.ThankYouBatchResult:
    """BulkThankYouDialog.jsx: thank one batch of the event's accepted
    guests. The dialog splits the whole list into small batches and calls
    this once per batch, so it can show progress, pause and cancel between
    batches, and so no single request runs long enough to time out.

    Each item is sent exactly like send_thanks (same channels, same audit
    row, thanked_at set). The dialog leaves out already-thanked guests
    unless told otherwise; this endpoint sends to whoever it's given. A
    guest who can't be thanked (not this event's, not accepted, no
    phone) gets an error in their result instead of failing the batch."""
    event = _get_event_or_404(db, event_id)
    ids = [item.recipient_id for item in body.items]
    found = {
        r.id: r
        for r in db.query(models.InvitationRecipient)
        .filter(models.InvitationRecipient.id.in_(ids), models.InvitationRecipient.event_id == event.id)
        .all()
    }
    results: list[schemas.ThankYouBatchItemResult] = []
    for item in body.items:
        recipient = found.get(item.recipient_id)
        error = "Recipient not found" if recipient is None else _thanks_ineligible_reason(recipient)
        if error:
            results.append(schemas.ThankYouBatchItemResult(recipient_id=item.recipient_id, success=False, error=error))
            continue
        sent, used = _send_thanks_to(db, user, recipient, item.message, batch=True)
        results.append(schemas.ThankYouBatchItemResult(recipient_id=recipient.id, success=sent, channel=used))
    db.commit()
    return schemas.ThankYouBatchResult(results=results)


# Event reminders — times are shown in Israel time whatever the server's zone.
_EVENT_TZ = ZoneInfo("Asia/Jerusalem")
_WEEKDAYS_AR = ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
_PLACEHOLDER = re.compile(r"\[(\w+)\]")


def _fill_reminder(template: str, event: models.Event, recipient: models.InvitationRecipient) -> str:
    """Fills a reminder template for one guest. Same placeholders and
    tidy-up as the frontend preview (frontend/src/lib/reminderMessage.js):
    unknown [placeholders] are left as typed, and an empty one doesn't leave
    a doubled space or a space before punctuation behind."""
    app_url = os.environ.get("APP_URL", "https://daawatey.com")
    when = event.date.astimezone(_EVENT_TZ)
    values = {
        "target_string": _resolve_display_name(
            recipient.external_full_name,
            recipient.nickname,
            recipient.first_name,
            recipient.last_name,
            recipient.name_suffix,
        )
        or "",
        "event_title": event.title or "",
        "day": _WEEKDAYS_AR[when.weekday()],
        "date": when.strftime("%d/%m/%Y"),
        "time": when.strftime("%H:%M"),
        "venue": event.venue_name or "",
        "invite_link": f"{app_url}/i/{recipient.personal_token}",
    }
    filled = _PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), template)
    lines = [
        re.sub(r" ([،,.!؟?])", r"\1", re.sub(r"[ \t]{2,}", " ", line)).strip()
        for line in filled.split("\n")
    ]
    return "\n".join(lines)


# The current reminder format (ReminderSend.details): a fixed greeting and
# closing line around the event's free text — exactly the wording of the
# WhatsApp templates reminder_accepted / reminder_pending (whatsapp.py), so
# the SMS reads the same. Keep in sync with frontend/src/lib/reminderMessage.js.
DEFAULT_REMINDER_DETAILS = "[event_title] يوم [day] [date] الساعة [time] في [venue]."
_REMINDER_CLOSING = {
    "accepted": "الرجاء الضغط على الرابط أدناه لعرض التفاصيل.",
    "pending": "الرجاء الضغط على الرابط أدناه لتأكيد الحضور.",
}
_REMINDER_SMS_CLOSING = {
    "accepted": "لعرض التفاصيل:",
    "pending": "لتأكيد الحضور:",
}


def _reminder_messages(details: str, event: models.Event, recipient: models.InvitationRecipient) -> dict:
    """One guest's reminder in every channel's form: the WhatsApp template
    and its two variables, the SMS text (the link replaces the button) and
    the push text (no link: tapping it opens the invitation)."""
    group = "accepted" if recipient.rsvp_status == models.RsvpStatus.accepted else "pending"
    name = (
        _resolve_display_name(
            recipient.external_full_name,
            recipient.nickname,
            recipient.first_name,
            recipient.last_name,
            recipient.name_suffix,
        )
        or "ضيفنا الكريم"
    )
    # One line: WhatsApp template variables can't contain line breaks.
    filled = " ".join(_fill_reminder(details, event, recipient).split())
    app_url = os.environ.get("APP_URL", "https://daawatey.com")
    opening = f"حضرة {name}، نذكّركم بموعد مناسبتكم: {filled}"
    return {
        "template_key": f"reminder_{group}",
        "template_values": [name, filled],
        "sms": f"{opening} {_REMINDER_SMS_CLOSING[group]} {app_url}/i/{recipient.personal_token}",
        "push": opening,
    }


def send_thanks_sms_fallback(db: Session, recipient_id: str, wamid: str | None) -> bool:
    """The thank-you counterpart of send_invitation_sms_fallback: Meta
    reported a WhatsApp thank-you it had accepted as undelivered (often
    131049, its marketing-message limit), so the guest gets the SMS
    thank-you instead — the text the dialog filled in for them, saved in
    thanks_sms when the WhatsApp went out. Same rules: whatsapp_then_sms
    only, once per failed message.

    If no SMS goes out (another channel setting, no saved text, or the SMS
    itself failed), thanked_at is cleared: the guest never got a thank-you,
    so the bulk thank-you mustn't skip them as already thanked."""
    recipient = db.get(models.InvitationRecipient, recipient_id)
    if recipient is None:
        return False
    if wamid and recipient.sms_fallback_wamid == wamid:
        return False
    sent = False
    if recipient.phone and recipient.thanks_sms and invitation_channel_for(recipient.phone) == "whatsapp_then_sms":
        sent = send_sms(recipient.phone, recipient.thanks_sms, reference=recipient.id)
    if not sent:
        recipient.thanked_at = None
    recipient.sms_fallback_wamid = wamid
    event = recipient.event
    audit(
        db,
        None,
        "recipient.whatsapp_sms_fallback",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta={"event_id": event.id, "event_title": event.title, "wamid": wamid, "sent": sent, "kind": "thanks"},
    )
    db.commit()
    return sent


def send_reminder_sms_fallback(db: Session, recipient_id: str, wamid: str | None) -> bool:
    """The reminder counterpart of send_invitation_sms_fallback: Meta
    reported a WhatsApp reminder it had accepted as undelivered, so the
    guest gets the SMS reminder instead, rebuilt from the event's saved
    reminder text. Same rules: whatsapp_then_sms only, once per failed
    message."""
    recipient = db.get(models.InvitationRecipient, recipient_id)
    if recipient is None or not recipient.phone:
        return False
    if invitation_channel_for(recipient.phone) != "whatsapp_then_sms":
        return False
    if wamid and recipient.sms_fallback_wamid == wamid:
        return False
    event = recipient.event
    text = _reminder_messages(event.reminder_details or DEFAULT_REMINDER_DETAILS, event, recipient)["sms"]
    sent = send_sms(recipient.phone, text, reference=recipient.id)
    recipient.sms_fallback_wamid = wamid
    audit(
        db,
        None,
        "recipient.whatsapp_sms_fallback",
        "recipient",
        recipient.id,
        label=_recipient_label(recipient),
        meta={"event_id": event.id, "event_title": event.title, "wamid": wamid, "sent": sent, "kind": "reminder"},
    )
    db.commit()
    return sent


def _remind_recipient(
    db: Session,
    event: models.Event,
    recipient: models.InvitationRecipient,
    linked_user: models.User | None,
    *,
    details: str | None,
    message_accepted: str | None = None,
    message_pending: str | None = None,
    sms_app_users: bool = False,
    now: datetime,
) -> tuple[bool, bool, bool]:
    """Sends one guest's reminder by the rules in send_reminders' docstring
    and, when anything went out, bumps their reminder_count and
    last_reminded_at. Doesn't commit. Returns (pushed, whatsapp, sms)."""
    if details is not None:
        messages = _reminder_messages(details, event, recipient)
        push_text, sms_text = messages["push"], messages["sms"]
    else:
        template = message_accepted if recipient.rsvp_status == models.RsvpStatus.accepted else message_pending
        messages = None
        push_text = sms_text = _fill_reminder(template, event, recipient)

    pushed = False
    if linked_user:
        _notify_recipient_in_app(db, recipient, title="تذكير", message=push_text, event_id=event.id)
        pushed = send_push_to_user(
            db,
            linked_user,
            title="🔔 تذكير",
            body=push_text,
            data={"path": f"/i/{recipient.personal_token}"},
        )
    whatsapp_sent = texted = False
    if recipient.phone and (not pushed or sms_app_users):
        channel = invitation_channel_for(recipient.phone) if messages else "sms"
        if channel in ("whatsapp", "whatsapp_then_sms"):
            whatsapp_sent = send_whatsapp_template(
                recipient.phone,
                messages["template_key"],
                messages["template_values"],
                # "remind-" tells the webhook this one gets the SMS
                # fallback if Meta later reports it undelivered.
                reference=f"remind-{recipient.id}",
                personal_token=recipient.personal_token,
            )
        if channel == "sms" or (channel == "whatsapp_then_sms" and not whatsapp_sent):
            texted = send_sms(recipient.phone, sms_text, reference=recipient.id)

    if pushed or whatsapp_sent or texted:
        recipient.reminder_count = (recipient.reminder_count or 0) + 1
        recipient.last_reminded_at = now
    return pushed, whatsapp_sent, texted


@router.post("/events/{event_id}/send-reminders", response_model=schemas.ReminderResult)
def send_reminders(
    event_id: str,
    body: schemas.ReminderSend,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> schemas.ReminderResult:
    """ReminderDialog.jsx: remind the guests whose RSVP is in body.statuses.

    Guests linked to an app account get a push + in-app notification; if
    the push reaches none of their devices they get a phone message instead
    (and with sms_app_users, the phone message as well). Everyone else gets
    the phone message.

    With `details` (the current format) the phone message goes out per
    INVITATION_CHANNEL: the reminder_accepted / reminder_pending WhatsApp
    template, SMS, or WhatsApp with SMS as the fallback — the same text
    either way (_reminder_messages). Without it (app builds from before),
    accepted guests get message_accepted and pending/maybe guests
    message_pending, by SMS only, as before.

    A guest's reminder_count goes up only when something actually went
    out. Admin/manager only — every message costs money, same as
    send_thanks. The texts are saved on the event for next time."""
    event = _get_event_or_404(db, event_id)
    if event.date and event.date <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="The event has already started")

    statuses = {s for s in body.statuses if s != models.RsvpStatus.declined}
    if body.details is not None:
        event.reminder_details = body.details
    else:
        event.reminder_message = body.message_accepted
        event.reminder_message_pending = body.message_pending

    recipients = (
        db.query(models.InvitationRecipient)
        .filter(
            models.InvitationRecipient.event_id == event_id,
            models.InvitationRecipient.rsvp_status.in_(statuses),
        )
        .all()
    )
    result = dict(reminded=0, push=0, whatsapp=0, sms=0, failed=0, skipped_already_reminded=0, skipped_no_contact=0)
    now = datetime.now(timezone.utc)
    for recipient in recipients:
        if recipient.last_reminded_at and not body.include_already_reminded:
            result["skipped_already_reminded"] += 1
            continue
        linked_user = db.get(models.User, recipient.user_id) if recipient.user_id else None
        if not linked_user and not recipient.phone:
            result["skipped_no_contact"] += 1
            continue

        pushed, whatsapp_sent, texted = _remind_recipient(
            db,
            event,
            recipient,
            linked_user,
            details=body.details,
            message_accepted=body.message_accepted,
            message_pending=body.message_pending,
            sms_app_users=body.sms_app_users,
            now=now,
        )
        if pushed or whatsapp_sent or texted:
            result["reminded"] += 1
            result["push"] += int(pushed)
            result["whatsapp"] += int(whatsapp_sent)
            result["sms"] += int(texted)
        else:
            result["failed"] += 1
    audit(
        db,
        user,
        "event.send_reminders",
        "event",
        event.id,
        label=event.title,
        meta={**result, "statuses": sorted(statuses)},
    )
    db.commit()
    return schemas.ReminderResult(**result)


@router.post("/events/{event_id}/send-reminders-batch", response_model=schemas.ReminderBatchResult)
def send_reminders_batch(
    event_id: str,
    body: schemas.ReminderBatchSend,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> schemas.ReminderBatchResult:
    """ReminderDialog.jsx: remind one batch of guests. The dialog picks who
    gets it (by RSVP status, skipping already-reminded guests unless told
    otherwise — the same choice send_reminders makes) and calls this once
    per batch, so it can show progress and pause or stop between batches.

    Each guest is reminded exactly as in send_reminders (_remind_recipient).
    A guest who can't be reminded (not this event's, declined, no app
    account and no phone) gets an error in their result instead of failing
    the batch. The reminder text is saved on the event for next time."""
    event = _get_event_or_404(db, event_id)
    if event.date and event.date <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="The event has already started")
    event.reminder_details = body.details

    found = {
        r.id: r
        for r in db.query(models.InvitationRecipient)
        .filter(
            models.InvitationRecipient.id.in_(body.recipient_ids),
            models.InvitationRecipient.event_id == event.id,
        )
        .all()
    }
    now = datetime.now(timezone.utc)
    results: list[schemas.ReminderBatchItemResult] = []
    counts = dict(reminded=0, push=0, whatsapp=0, sms=0, failed=0)
    for recipient_id in body.recipient_ids:
        recipient = found.get(recipient_id)
        linked_user = db.get(models.User, recipient.user_id) if recipient and recipient.user_id else None
        if recipient is None:
            error = "Recipient not found"
        elif recipient.rsvp_status == models.RsvpStatus.declined:
            error = "Declined guests aren't reminded"
        elif not linked_user and not recipient.phone:
            error = "Recipient has no app account or phone number"
        else:
            error = None
        if error:
            counts["failed"] += 1
            results.append(schemas.ReminderBatchItemResult(recipient_id=recipient_id, success=False, error=error))
            continue
        pushed, whatsapp_sent, texted = _remind_recipient(
            db, event, recipient, linked_user, details=body.details, sms_app_users=body.sms_app_users, now=now
        )
        success = pushed or whatsapp_sent or texted
        counts["reminded" if success else "failed"] += 1
        counts["push"] += int(pushed)
        counts["whatsapp"] += int(whatsapp_sent)
        counts["sms"] += int(texted)
        results.append(
            schemas.ReminderBatchItemResult(
                recipient_id=recipient.id, success=success, push=pushed, whatsapp=whatsapp_sent, sms=texted
            )
        )
    audit(
        db,
        user,
        "event.send_reminders",
        "event",
        event.id,
        label=event.title,
        meta={**counts, "batch": True},
    )
    db.commit()
    return schemas.ReminderBatchResult(results=results)


@router.post("/events/{event_id}/send-invitations-batch", response_model=schemas.InvitationBatchResult)
def send_invitations_batch(
    event_id: str,
    body: schemas.InvitationBatchSend,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> schemas.InvitationBatchResult:
    """InvitationsDialog.jsx: send the invitation to one batch of guests
    already on the list (those never sent one, or everyone), the same way
    the per-guest resend does. Called once per batch so the dialog can show
    progress and pause or stop between batches, like reminders and
    thank-yous."""
    event = _get_event_or_404(db, event_id)
    found = {
        r.id: r
        for r in db.query(models.InvitationRecipient)
        .filter(
            models.InvitationRecipient.id.in_(body.recipient_ids),
            models.InvitationRecipient.event_id == event.id,
        )
        .all()
    }
    results: list[schemas.InvitationBatchItemResult] = []
    counts = dict(sent=0, failed=0)
    for recipient_id in body.recipient_ids:
        recipient = found.get(recipient_id)
        if recipient is None:
            error = "Recipient not found"
        elif not recipient.phone and not recipient.email:
            error = "Recipient has no phone or email"
        elif not _send_invitation(event, recipient, invited_by=user):
            error = "Not delivered"
        else:
            error = None
            recipient.sent_count = (recipient.sent_count or 0) + 1
        counts["failed" if error else "sent"] += 1
        results.append(schemas.InvitationBatchItemResult(recipient_id=recipient_id, success=error is None, error=error))
    audit(db, user, "event.send_invitations", "event", event.id, label=event.title, meta={**counts, "batch": True})
    db.commit()
    return schemas.InvitationBatchResult(results=results)


@router.post("/events/{event_id}/import-invitations-batch", response_model=schemas.ImportInvitationBatchResult)
def import_invitations_batch(
    event_id: str,
    body: schemas.ImportInvitationBatch,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> schemas.ImportInvitationBatchResult:
    """ImportInvitees.jsx «إرسال الدعوات للجميع»: add and invite one batch
    of rows from the file, each exactly like the row's own «إرسال دعوة»
    (add_recipient). A row whose phone is already a guest of the event is
    reported as already invited, not as a failure."""
    event = _get_event_or_404(db, event_id)
    results: list[schemas.ImportInvitationItemResult] = []
    for guest in body.guests:
        data = guest.model_dump(exclude={"client_id"})
        try:
            recipient = _add_and_invite(db, event, user, schemas.RecipientCreate(**data), batch=True)
        except HTTPException as exc:
            db.rollback()
            if exc.status_code == status.HTTP_409_CONFLICT:
                results.append(schemas.ImportInvitationItemResult(client_id=guest.client_id, success=True, already_invited=True))
            else:
                results.append(schemas.ImportInvitationItemResult(client_id=guest.client_id, success=False, error=str(exc.detail)))
            continue
        sent = bool(recipient.sent_count)
        results.append(
            schemas.ImportInvitationItemResult(
                client_id=guest.client_id,
                success=sent,
                recipient_id=recipient.id,
                # Added to the event either way; only the message failed.
                error=None if sent else "Added, but the invitation wasn't delivered",
            )
        )
    return schemas.ImportInvitationBatchResult(results=results)


def _attach_towns(
    recipients: list[models.InvitationRecipient], db: Session
) -> list[schemas.RecipientOut]:
    """RecipientOut.town prefers the linked User account's town, falling back
    to the recipient's own town (set by the inviter for an unregistered
    guest) — one batched lookup for the whole list instead of a query per
    row."""
    user_ids = {r.user_id for r in recipients if r.user_id}
    towns: dict[str, str | None] = {}
    if user_ids:
        for uid, town in db.query(models.User.id, models.User.town).filter(
            models.User.id.in_(user_ids)
        ):
            towns[uid] = town
    return [
        schemas.RecipientOut.model_validate(r).model_copy(
            update={"town": towns.get(r.user_id) or r.town}
        )
        for r in recipients
    ]


@router.get("/events/{event_id}/recipients", response_model=list[schemas.RecipientOut])
def list_recipients(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[schemas.RecipientOut]:
    """getEventRecipients: the guest list behind Flow D's search/filter/
    export for admin/manager/owner — but EventDetails.jsx also calls this
    for a plain invited guest viewing their own event page (to find their
    own RSVP and decide whether to show the owner-only stats/guest-list
    sections at all). _require_event_access alone would 403 that guest
    outright; instead, anyone actually invited gets back *only their own*
    recipient row(s), never the rest of the guest list — admin/manager/
    owner still get everyone."""
    event = _get_event_or_404(db, event_id)
    all_recipients = list(
        db.query(models.InvitationRecipient)
        .filter(models.InvitationRecipient.event_id == event_id)
        .order_by(models.InvitationRecipient.created_at)
        .all()
    )
    if user.role in (models.Role.admin, models.Role.manager) or _is_owner_or_manager(event, user):
        return _attach_towns(all_recipients, db)

    mine = [
        r
        for r in all_recipients
        if r.user_id == user.id
        or (user.email and r.email == user.email)
        or (user.phone and r.phone == user.phone)
    ]
    if not mine:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized for this event")
    return _attach_towns(mine, db)


# --- Public invitation flow (Flow B) — looked up by token, no auth at all ---


def _to_public_invitation(recipient: models.InvitationRecipient) -> schemas.PublicInvitationOut:
    # Imported here: seating.py imports this module's helpers.
    from app.routers.seating import guest_tables, hall_plan

    event = recipient.event
    db = object_session(recipient)
    return schemas.PublicInvitationOut(
        recipient_id=recipient.id,
        event_id=event.id,
        checkin_enabled=event.checkin_enabled,
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
            recipient.name_suffix,
        ),
        rsvp_status=recipient.rsvp_status,
        rsvp_guests_count=recipient.rsvp_guests_count,
        invited_guests_count=recipient.guests_count,
        tables=guest_tables(db, recipient) if db is not None else [],
        hall_plan=hall_plan(db, event) if db is not None else None,
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
