"""Entrance check-in: a guest scans the QR sign at the door, sees their
table and confirms how many of them arrived.

Optional per event (`checkin_enabled`); works with or without seating.
The public endpoints need no login — the page recognises the guest by the
personal_token remembered from their invitation link, or by the phone
number they type in. They're rate-limited per IP and event, only answer on
the event day, and never reveal anything about a number that isn't on the
guest list. One CheckIn row per invitation: a second scan updates the
count instead of adding to it.

Hosts get the full arrivals list; a venue owner only ever gets counts.
"""

import time
from collections import defaultdict, deque
from datetime import datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import audit
from app.auth import get_app_user
from app.db import get_db
from app.integrations.pulseem import find_by_phone
from app.routers.events import _get_event_or_404, _require_event_access, _resolve_display_name
from app.routers.seating import guest_tables, hall_plan, party_size
from app.routers.venues import owned_venues

router = APIRouter(prefix="/api", tags=["checkin"])

_EVENT_TZ = ZoneInfo("Asia/Jerusalem")
OPENS_BEFORE = timedelta(hours=6)
MIN_OPEN_AFTER_START = timedelta(hours=8)

# Lookups per IP per event in a sliding window. In-memory, so per Cloud Run
# instance — enough to stop someone walking through phone numbers.
_RATE_LIMIT = 20
_RATE_WINDOW = 600.0
_attempts: dict[tuple[str, str], deque] = defaultdict(deque)


def check_in_window(event: models.Event) -> tuple[datetime, datetime]:
    """From a few hours before the start until the end of the event day
    (Israel time), and at least 8 hours after the start for late events."""
    start = event.date if event.date.tzinfo else event.date.replace(tzinfo=timezone.utc)
    local_day_end = datetime.combine(
        start.astimezone(_EVENT_TZ).date() + timedelta(days=1), dtime(0, 0), tzinfo=_EVENT_TZ
    )
    return start - OPENS_BEFORE, max(local_day_end, start + MIN_OPEN_AFTER_START)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit(request: Request, event_id: str) -> None:
    key = (_client_ip(request), event_id)
    now = time.monotonic()
    hits = _attempts[key]
    while hits and now - hits[0] > _RATE_WINDOW:
        hits.popleft()
    if len(hits) >= _RATE_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts, try again later")
    hits.append(now)


def _checkin_event(db: Session, event_id: str) -> models.Event:
    event = db.get(models.Event, event_id)
    if event is None or not event.checkin_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Check-in is not available for this event")
    return event


def _require_open(event: models.Event) -> None:
    opens, closes = check_in_window(event)
    now = datetime.now(timezone.utc)
    if not (opens <= now <= closes):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Check-in is closed right now")


def _find_recipient(db: Session, event: models.Event, body: schemas.CheckInLookup) -> models.InvitationRecipient:
    recipient = None
    if body.personal_token:
        recipient = (
            db.query(models.InvitationRecipient)
            .filter(
                models.InvitationRecipient.personal_token == body.personal_token,
                models.InvitationRecipient.event_id == event.id,
            )
            .one_or_none()
        )
    if recipient is None and body.phone:
        recipient = find_by_phone(
            db, models.InvitationRecipient, body.phone, models.InvitationRecipient.event_id == event.id
        )
    # Same answer whatever the reason, so the endpoint can't be used to learn
    # anything about a number.
    if recipient is None or recipient.rsvp_status == models.RsvpStatus.declined:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found on the guest list")
    return recipient


def _display_name(recipient: models.InvitationRecipient) -> str | None:
    return _resolve_display_name(
        recipient.external_full_name,
        recipient.nickname,
        recipient.first_name,
        recipient.last_name,
        recipient.name_suffix,
    )


def _guest_out(db: Session, recipient: models.InvitationRecipient) -> schemas.CheckInGuestOut:
    check_in = (
        db.query(models.CheckIn).filter(models.CheckIn.recipient_id == recipient.id).one_or_none()
    )
    return schemas.CheckInGuestOut(
        display_name=_display_name(recipient),
        expected_people=party_size(recipient),
        tables=guest_tables(db, recipient),
        hall_plan=hall_plan(db, recipient.event),
        checked_in=check_in is not None,
        people_arrived=check_in.people_arrived if check_in else None,
    )


def _record(db: Session, recipient: models.InvitationRecipient, people: int, method: str) -> None:
    check_in = (
        db.query(models.CheckIn).filter(models.CheckIn.recipient_id == recipient.id).one_or_none()
    )
    if check_in is None:
        db.add(
            models.CheckIn(
                event_id=recipient.event_id,
                recipient_id=recipient.id,
                people_arrived=people,
                method=method,
                checked_in_at=datetime.now(timezone.utc),
            )
        )
    else:
        check_in.people_arrived = people
        check_in.method = method


# --- public (the QR sign at the entrance) -----------------------------------


@router.get("/public/checkin/{event_id}", response_model=schemas.CheckInEventOut)
def get_checkin_event(event_id: str, db: Session = Depends(get_db)) -> schemas.CheckInEventOut:
    event = _checkin_event(db, event_id)
    opens, closes = check_in_window(event)
    now = datetime.now(timezone.utc)
    return schemas.CheckInEventOut(
        event_id=event.id,
        event_title=event.title,
        event_date=event.date,
        venue_name=event.venue_name,
        theme_color=event.theme_color,
        open=opens <= now <= closes,
        opens_at=opens,
        closes_at=closes,
        seating=event.seating_enabled and event.seating_published,
    )


@router.post("/public/checkin/{event_id}/lookup", response_model=schemas.CheckInGuestOut)
def lookup_guest(
    event_id: str,
    body: schemas.CheckInLookup,
    request: Request,
    db: Session = Depends(get_db),
) -> schemas.CheckInGuestOut:
    event = _checkin_event(db, event_id)
    _require_open(event)
    _rate_limit(request, event.id)
    return _guest_out(db, _find_recipient(db, event, body))


@router.post("/public/checkin/{event_id}", response_model=schemas.CheckInGuestOut)
def check_in(
    event_id: str,
    body: schemas.CheckInSubmit,
    request: Request,
    db: Session = Depends(get_db),
) -> schemas.CheckInGuestOut:
    event = _checkin_event(db, event_id)
    _require_open(event)
    _rate_limit(request, event.id)
    recipient = _find_recipient(db, event, body)
    _record(db, recipient, body.people_arrived, "qr_self")
    db.commit()
    return _guest_out(db, recipient)


# --- host and venue owner ----------------------------------------------------


def _arrivals(db: Session, event: models.Event) -> schemas.ArrivalsOut:
    recipients = {
        r.id: r
        for r in db.query(models.InvitationRecipient).filter(models.InvitationRecipient.event_id == event.id)
    }
    check_ins = (
        db.query(models.CheckIn)
        .filter(models.CheckIn.event_id == event.id)
        .order_by(models.CheckIn.checked_in_at.desc())
        .all()
    )
    accepted = [r for r in recipients.values() if r.rsvp_status == models.RsvpStatus.accepted]
    arrived_by_recipient = {c.recipient_id: c.people_arrived for c in check_ins}

    per_table: list[schemas.TableArrivals] = []
    if event.seating_enabled:
        tables = (
            db.query(models.EventTable)
            .filter(models.EventTable.event_id == event.id)
            .order_by(models.EventTable.sort_order, models.EventTable.created_at)
            .all()
        )
        rows = (
            db.query(models.SeatingAssignment)
            .join(models.EventTable, models.EventTable.id == models.SeatingAssignment.table_id)
            .filter(models.EventTable.event_id == event.id)
            .all()
        )
        seated: dict[str, int] = defaultdict(int)
        arrived: dict[str, int] = defaultdict(int)
        for a in rows:
            seated[a.table_id] += a.seats
            if a.recipient_id in arrived_by_recipient:
                # A split family's arrivals are spread over its tables in
                # proportion to their seats there.
                total = party_size(recipients[a.recipient_id]) or 1
                arrived[a.table_id] += round(arrived_by_recipient[a.recipient_id] * a.seats / total)
        per_table = [
            schemas.TableArrivals(
                table_id=t.id, number=t.number, arrived=arrived[t.id], capacity=t.capacity, seated=seated[t.id]
            )
            for t in tables
        ]

    return schemas.ArrivalsOut(
        checked_in_invitations=len(check_ins),
        people_arrived=sum(c.people_arrived for c in check_ins),
        expected_people=sum(party_size(r) for r in accepted),
        accepted_invitations=len(accepted),
        per_table=per_table,
        arrivals=[
            schemas.ArrivalOut(
                recipient_id=c.recipient_id,
                display_name=_display_name(recipients[c.recipient_id]) if c.recipient_id in recipients else None,
                people_arrived=c.people_arrived,
                method=c.method,
                checked_in_at=c.checked_in_at,
            )
            for c in check_ins
        ],
    )


@router.get("/events/{event_id}/arrivals", response_model=schemas.ArrivalsOut)
def get_arrivals(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.ArrivalsOut:
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    return _arrivals(db, event)


@router.post("/events/{event_id}/arrivals", response_model=schemas.ArrivalsOut)
def mark_arrival(
    event_id: str,
    body: schemas.ManualArrival,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.ArrivalsOut:
    """The host marks a guest as arrived by hand (e.g. at the reception
    table), any time — not limited to the check-in window."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    recipient = db.get(models.InvitationRecipient, body.recipient_id)
    if recipient is None or recipient.event_id != event.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invitee not found in this event")
    _record(db, recipient, body.people_arrived, "host_manual")
    audit(
        db, user, "checkin.manual", "recipient", recipient.id, label=_display_name(recipient),
        meta={"event_id": event.id, "people_arrived": body.people_arrived},
    )
    db.commit()
    return _arrivals(db, event)


@router.delete("/events/{event_id}/arrivals/{recipient_id}", response_model=schemas.ArrivalsOut)
def unmark_arrival(
    event_id: str,
    recipient_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.ArrivalsOut:
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    check_in = (
        db.query(models.CheckIn)
        .filter(models.CheckIn.recipient_id == recipient_id, models.CheckIn.event_id == event.id)
        .one_or_none()
    )
    if check_in is not None:
        db.delete(check_in)
        db.commit()
    return _arrivals(db, event)


@router.get("/venues/{venue_id}/arrivals", response_model=list[schemas.ArrivalCounts])
def venue_arrivals(
    venue_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[schemas.ArrivalCounts]:
    """Arrival counts for a venue's events with check-in on — counts only,
    never guest names. Venue owners see their own venues; admin/manager any."""
    venue = db.get(models.Venue, venue_id)
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Venue not found")
    if user.role not in (models.Role.admin, models.Role.manager) and venue.id not in {
        v.id for v in owned_venues(db, user)
    }:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized for this venue")
    events = (
        db.query(models.Event)
        .filter(models.Event.venue_id == venue.id, models.Event.checkin_enabled.is_(True))
        .order_by(models.Event.date.desc())
        .all()
    )
    result = []
    for event in events:
        a = _arrivals(db, event)
        result.append(
            schemas.ArrivalCounts(
                event_id=event.id,
                event_title=event.title,
                checked_in_invitations=a.checked_in_invitations,
                people_arrived=a.people_arrived,
                expected_people=a.expected_people,
            )
        )
    return result
