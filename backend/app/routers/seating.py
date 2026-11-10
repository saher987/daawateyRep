"""Table arrangement: the hall plan (tables + hall elements), who sits where,
auto-assign, and the seating groups (side + group) behind it.

Optional per event: everything here answers 409 unless the event's
`seating_enabled` is on, so an RSVP-only event never sees any of it. Same
permission rule as editing the guest list (_require_event_access). Guests
see their table only through the public invitation page / entrance
check-in, and only once the host publishes the seating (`guest_tables`).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import audit
from app.auth import get_app_user
from app.db import get_db
from app.routers.events import _get_event_or_404, _require_event_access

router = APIRouter(prefix="/api", tags=["seating"])

PLAN_W = 760
PLAN_H = 560
SNAP = 10

# A new event's starting hall: stage at the top, dance floor in the middle,
# entrance at the bottom. Labels stay empty so the app shows its own
# translated names; the host moves or renames them to match the real hall.
DEFAULT_HALL = [
    ("stage", 380, 42, 260, 56),
    ("buffet", 670, 34, 140, 40),
    ("photo", 80, 34, 120, 40),
    ("dance_floor", 380, 220, 200, 200),
    ("entrance", 380, 541, 100, 38),
]


# --- helpers ---------------------------------------------------------------


def _seating_event(db: Session, event_id: str, user: models.User) -> models.Event:
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    if not event.seating_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Table arrangement is off for this event")
    return event


def _footprint(shape: str, seats_round: int, top: int, bottom: int, left: int, right: int, rotation: int) -> tuple[int, int]:
    """Width/height a table takes on the plan, chairs included — the same
    geometry the frontend draws, so overlap checks agree with what's seen."""
    if shape == "round":
        return 112, 112
    # Chairs along the long sides plus room for an end chair on each side.
    n = max(top, bottom, 1)
    w, h = n * 24 + 52, 80
    return (h, w) if rotation == 90 else (w, h)


def _table_box(t) -> tuple[float, float, float, float]:
    w, h = _footprint(t.shape, t.seats_round, t.seats_top, t.seats_bottom, t.seats_left, t.seats_right, t.rotation)
    inset = 4
    return (t.x - w / 2 + inset, t.y - h / 2 + inset, t.x + w / 2 - inset, t.y + h / 2 - inset)


def _element_box(e) -> tuple[float, float, float, float]:
    return (e.x - e.w / 2, e.y - e.h / 2, e.x + e.w / 2, e.y + e.h / 2)


def _hit(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


class _Probe:
    """Stand-in table for free-spot search."""

    def __init__(self, shape, seats_round, top, bottom, left, right, rotation, x=0, y=0):
        self.shape, self.seats_round = shape, seats_round
        self.seats_top, self.seats_bottom, self.seats_left, self.seats_right = top, bottom, left, right
        self.rotation, self.x, self.y = rotation, x, y


def _free_spot(probe: _Probe, boxes: list) -> tuple[int, int]:
    w, h = _footprint(probe.shape, probe.seats_round, probe.seats_top, probe.seats_bottom, probe.seats_left, probe.seats_right, probe.rotation)
    y = max(100, (h // 2 // SNAP + 1) * SNAP)
    while y <= PLAN_H - h / 2:
        x = (w // 2 // SNAP + 1) * SNAP
        while x <= PLAN_W - w / 2:
            probe.x, probe.y = x, y
            box = _table_box(probe)
            if not any(_hit(box, other) for other in boxes):
                return x, y
            x += 20
        y += 20
    return PLAN_W // 2, PLAN_H // 2


def _clamp_snap(value: int, size: int, limit: int) -> int:
    """Snap to the grid, keeping the whole item inside the plan (the bounds
    are grid points too, so an item pushed to the edge stays on the grid)."""
    half = (size + 1) // 2
    lo = -(-half // SNAP) * SNAP
    hi = max(lo, (limit - half) // SNAP * SNAP)
    return max(lo, min(hi, round(value / SNAP) * SNAP))


def _next_number(tables: list[models.EventTable]) -> str:
    numbers = [int(t.number) for t in tables if t.number.isdigit()]
    return str(max(numbers, default=0) + 1)


def _ensure_default_hall(db: Session, event: models.Event) -> None:
    exists = db.query(models.HallElement.id).filter(models.HallElement.event_id == event.id).first()
    if exists is None:
        for kind, x, y, w, h in DEFAULT_HALL:
            db.add(models.HallElement(event_id=event.id, kind=kind, x=x, y=y, w=w, h=h))
        db.commit()


def _tables(db: Session, event_id: str) -> list[models.EventTable]:
    return list(
        db.query(models.EventTable)
        .filter(models.EventTable.event_id == event_id)
        .order_by(models.EventTable.sort_order, models.EventTable.created_at)
        .all()
    )


def _assignments(db: Session, event_id: str) -> list[models.SeatingAssignment]:
    return list(
        db.query(models.SeatingAssignment)
        .join(models.EventTable, models.EventTable.id == models.SeatingAssignment.table_id)
        .filter(models.EventTable.event_id == event_id)
        .all()
    )


def _state(db: Session, event: models.Event) -> schemas.SeatingState:
    tables = _tables(db, event.id)
    assignments = _assignments(db, event.id)
    seated: dict[str, int] = {}
    for a in assignments:
        seated[a.table_id] = seated.get(a.table_id, 0) + a.seats
    elements = (
        db.query(models.HallElement)
        .filter(models.HallElement.event_id == event.id)
        .order_by(models.HallElement.created_at)
        .all()
    )
    return schemas.SeatingState(
        seating_enabled=event.seating_enabled,
        seating_published=event.seating_published,
        seating_locked_at=event.seating_locked_at,
        tables=[
            schemas.TableOut.model_validate(t).model_copy(update={"seated": seated.get(t.id, 0)})
            for t in tables
        ],
        hall_elements=[schemas.HallElementOut.model_validate(e) for e in elements],
        assignments=[
            schemas.AssignmentOut(recipient_id=a.recipient_id, table_id=a.table_id, seats=a.seats)
            for a in assignments
        ],
    )


def party_size(recipient: models.InvitationRecipient) -> int:
    """How many seats an invitation needs: the confirmed count, else the
    invited count."""
    if recipient.rsvp_guests_count:
        return recipient.rsvp_guests_count
    return recipient.guests_count or 1


def guest_tables(db: Session, recipient: models.InvitationRecipient) -> list[schemas.GuestTable]:
    """The tables a guest may see — empty unless seating is on and published."""
    event = recipient.event
    if not (event.seating_enabled and event.seating_published):
        return []
    rows = (
        db.query(models.SeatingAssignment, models.EventTable)
        .join(models.EventTable, models.EventTable.id == models.SeatingAssignment.table_id)
        .filter(models.SeatingAssignment.recipient_id == recipient.id)
        .order_by(models.EventTable.sort_order, models.EventTable.created_at)
        .all()
    )
    return [
        schemas.GuestTable(table_id=t.id, number=t.number, label=t.label, zone=t.zone, seats=a.seats)
        for a, t in rows
    ]


def hall_plan(db: Session, event: models.Event) -> schemas.HallPlanOut | None:
    """Positions only, for the guest's mini map — None unless published."""
    if not (event.seating_enabled and event.seating_published):
        return None
    tables = _tables(db, event.id)
    elements = db.query(models.HallElement).filter(models.HallElement.event_id == event.id).all()
    return schemas.HallPlanOut(
        tables=[
            schemas.PlanTableOut(
                id=t.id, number=t.number, shape=t.shape, x=t.x, y=t.y, rotation=t.rotation, capacity=t.capacity
            )
            for t in tables
        ],
        hall_elements=[schemas.HallElementOut.model_validate(e) for e in elements],
    )


# --- plan: tables and hall elements -----------------------------------------


@router.get("/events/{event_id}/seating", response_model=schemas.SeatingState)
def get_seating(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    event = _seating_event(db, event_id, user)
    _ensure_default_hall(db, event)
    return _state(db, event)


@router.put("/events/{event_id}/seating/settings", response_model=schemas.SeatingState)
def update_seating_settings(
    event_id: str,
    body: schemas.SeatingSettings,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    """Publish (guests see their table) and lock (moves need confirming in
    the app) toggles."""
    event = _seating_event(db, event_id, user)
    if body.seating_published is not None:
        event.seating_published = body.seating_published
    if body.locked is not None:
        event.seating_locked_at = datetime.now(timezone.utc) if body.locked else None
    audit(
        db, user, "seating.settings", "event", event.id, label=event.title,
        meta={"published": event.seating_published, "locked": event.seating_locked_at is not None},
    )
    db.commit()
    return _state(db, event)


def _validate_table(t) -> None:
    if t.shape != "round" and (t.seats_top + t.seats_bottom + t.seats_left + t.seats_right) < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="A table needs at least one chair")


@router.post("/events/{event_id}/tables", response_model=schemas.SeatingState, status_code=status.HTTP_201_CREATED)
def create_table(
    event_id: str,
    body: schemas.TableIn,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    event = _seating_event(db, event_id, user)
    existing = _tables(db, event.id)
    table = models.EventTable(
        event_id=event.id,
        number=(body.number or "").strip() or _next_number(existing),
        label=body.label,
        zone=body.zone,
        shape=body.shape,
        seats_round=body.seats_round,
        seats_top=body.seats_top,
        seats_bottom=body.seats_bottom,
        seats_left=body.seats_left,
        seats_right=body.seats_right,
        rotation=body.rotation,
        sort_order=len(existing),
    )
    if table.shape != "round" and not (table.seats_top or table.seats_bottom):
        table.seats_top = table.seats_bottom = 4
    _validate_table(table)
    if body.x is None or body.y is None:
        elements = db.query(models.HallElement).filter(models.HallElement.event_id == event.id).all()
        boxes = [_table_box(t) for t in existing] + [_element_box(e) for e in elements]
        table.x, table.y = _free_spot(
            _Probe(table.shape, table.seats_round, table.seats_top, table.seats_bottom, table.seats_left, table.seats_right, table.rotation),
            boxes,
        )
    else:
        w, h = _footprint(table.shape, table.seats_round, table.seats_top, table.seats_bottom, table.seats_left, table.seats_right, table.rotation)
        table.x, table.y = _clamp_snap(body.x, w, PLAN_W), _clamp_snap(body.y, h, PLAN_H)
    db.add(table)
    db.commit()
    return _state(db, event)


@router.post("/events/{event_id}/tables/bulk", response_model=schemas.SeatingState, status_code=status.HTTP_201_CREATED)
def create_tables_bulk(
    event_id: str,
    body: schemas.TablesBulkCreate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    """Quick setup: N identical tables in the first free spots."""
    event = _seating_event(db, event_id, user)
    existing = _tables(db, event.id)
    _ensure_default_hall(db, event)
    elements = db.query(models.HallElement).filter(models.HallElement.event_id == event.id).all()
    boxes = [_table_box(t) for t in existing] + [_element_box(e) for e in elements]
    for i in range(body.count):
        rect = body.shape != "round"
        table = models.EventTable(
            event_id=event.id,
            number=_next_number(existing),
            shape=body.shape,
            seats_round=body.seats_round,
            seats_top=body.seats_per_side if rect else 0,
            seats_bottom=body.seats_per_side if rect else 0,
            rotation=0,
            sort_order=len(existing),
        )
        table.x, table.y = _free_spot(
            _Probe(table.shape, table.seats_round, table.seats_top, table.seats_bottom, 0, 0, 0), boxes
        )
        boxes.append(_table_box(table))
        db.add(table)
        existing.append(table)
    db.commit()
    return _state(db, event)


def _get_table(db: Session, event: models.Event, table_id: str) -> models.EventTable:
    table = db.get(models.EventTable, table_id)
    if table is None or table.event_id != event.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Table not found")
    return table


def _seated_at(db: Session, table_id: str) -> int:
    return sum(
        a.seats
        for a in db.query(models.SeatingAssignment).filter(models.SeatingAssignment.table_id == table_id)
    )


@router.patch("/events/{event_id}/tables/{table_id}", response_model=schemas.SeatingState)
def update_table(
    event_id: str,
    table_id: str,
    body: schemas.TablePatch,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    """Edit chairs/shape/number, or move it ({x, y} — one call per drop)."""
    event = _seating_event(db, event_id, user)
    table = _get_table(db, event, table_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None and field not in ("label", "zone"):
            continue
        setattr(table, field, value.strip() if field == "number" else value)
    _validate_table(table)
    seated = _seated_at(db, table.id)
    if table.capacity < seated:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"{seated} guests are seated at this table; remove some before reducing chairs",
        )
    w, h = _footprint(table.shape, table.seats_round, table.seats_top, table.seats_bottom, table.seats_left, table.seats_right, table.rotation)
    table.x, table.y = _clamp_snap(table.x, w, PLAN_W), _clamp_snap(table.y, h, PLAN_H)
    db.commit()
    return _state(db, event)


@router.delete("/events/{event_id}/tables/{table_id}", response_model=schemas.SeatingState)
def delete_table(
    event_id: str,
    table_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    event = _seating_event(db, event_id, user)
    table = _get_table(db, event, table_id)
    if _seated_at(db, table.id):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Remove the guests from this table first")
    db.delete(table)
    db.commit()
    return _state(db, event)


@router.post("/events/{event_id}/hall-elements", response_model=schemas.SeatingState, status_code=status.HTTP_201_CREATED)
def create_hall_element(
    event_id: str,
    body: schemas.HallElementIn,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    event = _seating_event(db, event_id, user)
    db.add(models.HallElement(event_id=event.id, **body.model_dump()))
    db.commit()
    return _state(db, event)


def _get_element(db: Session, event: models.Event, element_id: str) -> models.HallElement:
    element = db.get(models.HallElement, element_id)
    if element is None or element.event_id != event.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hall element not found")
    return element


@router.patch("/events/{event_id}/hall-elements/{element_id}", response_model=schemas.SeatingState)
def update_hall_element(
    event_id: str,
    element_id: str,
    body: schemas.HallElementPatch,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    event = _seating_event(db, event_id, user)
    element = _get_element(db, event, element_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None and field != "label":
            continue
        setattr(element, field, value)
    element.x = _clamp_snap(element.x, element.w, PLAN_W)
    element.y = _clamp_snap(element.y, element.h, PLAN_H)
    db.commit()
    return _state(db, event)


@router.delete("/events/{event_id}/hall-elements/{element_id}", response_model=schemas.SeatingState)
def delete_hall_element(
    event_id: str,
    element_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    event = _seating_event(db, event_id, user)
    db.delete(_get_element(db, event, element_id))
    db.commit()
    return _state(db, event)


# --- who sits where ----------------------------------------------------------


def _event_recipients(db: Session, event_id: str) -> dict[str, models.InvitationRecipient]:
    return {
        r.id: r
        for r in db.query(models.InvitationRecipient).filter(models.InvitationRecipient.event_id == event_id)
    }


@router.put("/events/{event_id}/seating", response_model=schemas.SeatingState)
def update_seating(
    event_id: str,
    body: schemas.SeatingUpdate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    """Replace the allocations of every recipient in the body. Checks that a
    recipient isn't given more seats than their party, and that no table
    ends up over its chairs."""
    event = _seating_event(db, event_id, user)
    recipients = _event_recipients(db, event.id)
    tables = {t.id: t for t in _tables(db, event.id)}

    touched = set()
    for item in body.recipients:
        recipient = recipients.get(item.recipient_id)
        if recipient is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invitee not found in this event")
        if item.recipient_id in touched:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="An invitee is listed twice")
        touched.add(item.recipient_id)
        table_ids = [a.table_id for a in item.allocations]
        if len(set(table_ids)) != len(table_ids):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="A table is listed twice for one invitee")
        for a in item.allocations:
            if a.table_id not in tables:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Table not found")
        if sum(a.seats for a in item.allocations) > party_size(recipient):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="More seats than the invitation's guests",
            )

    current = _assignments(db, event.id)
    for a in current:
        if a.recipient_id in touched:
            db.delete(a)
    db.flush()

    seated: dict[str, int] = {}
    for a in current:
        if a.recipient_id not in touched:
            seated[a.table_id] = seated.get(a.table_id, 0) + a.seats
    for item in body.recipients:
        for a in item.allocations:
            seated[a.table_id] = seated.get(a.table_id, 0) + a.seats
            db.add(models.SeatingAssignment(recipient_id=item.recipient_id, table_id=a.table_id, seats=a.seats))
    for table_id, count in seated.items():
        if count > tables[table_id].capacity:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"Table {tables[table_id].number} has only {tables[table_id].capacity} chairs",
            )
    db.commit()
    return _state(db, event)


@router.delete("/events/{event_id}/seating", response_model=schemas.SeatingState)
def clear_seating(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.SeatingState:
    """"Clear all": every invitation back to waiting. Tables stay."""
    event = _seating_event(db, event_id, user)
    for a in _assignments(db, event.id):
        db.delete(a)
    audit(db, user, "seating.clear", "event", event.id, label=event.title)
    db.commit()
    return _state(db, event)


_SIDE_ORDER = {models.RecipientSide.groom: 0, models.RecipientSide.bride: 1, models.RecipientSide.both: 2}


def auto_assign(
    recipients: list[models.InvitationRecipient],
    tables: list[models.EventTable],
    assignments: list[tuple[str, str, int]],
) -> tuple[list[tuple[str, str, int]], int, int, int]:
    """Pure seating algorithm (no DB), so it can be tested on its own.

    Seats every confirmed invitation that still has guests without a seat,
    ordered by side, then group, then town, then party size (biggest
    first). For each one, the first table with room for the whole party
    that already has the same side + group; else one with only the same
    side; else an empty table; else any table with room. A party bigger
    than every table is split across tables (empty ones first). Existing
    assignments are kept. Returns (new rows, placed, split, left)."""
    free = {t.id: t.capacity for t in tables}
    who_at: dict[str, list[models.InvitationRecipient]] = {t.id: [] for t in tables}
    by_id = {r.id: r for r in recipients}
    seated_of: dict[str, int] = {}
    for recipient_id, table_id, seats in assignments:
        if table_id in free:
            free[table_id] -= seats
            if recipient_id in by_id:
                who_at[table_id].append(by_id[recipient_id])
        seated_of[recipient_id] = seated_of.get(recipient_id, 0) + seats

    todo = [
        r
        for r in recipients
        if r.rsvp_status == models.RsvpStatus.accepted and seated_of.get(r.id, 0) < party_size(r)
    ]
    todo.sort(
        key=lambda r: (
            _SIDE_ORDER.get(r.side, 9),
            (r.group_label or "").strip() == "",
            (r.group_label or "").strip(),
            r.town or "",
            -party_size(r),
        )
    )
    max_cap = max((t.capacity for t in tables), default=0)
    new_rows: list[tuple[str, str, int]] = []
    placed = split = left = 0
    order = [t.id for t in tables]

    def same_group(table_id: str, r: models.InvitationRecipient) -> bool:
        group = (r.group_label or "").strip()
        return bool(r.side and group) and any(
            o.side == r.side and (o.group_label or "").strip() == group for o in who_at[table_id]
        )

    def same_side_only(table_id: str, r: models.InvitationRecipient) -> bool:
        return bool(r.side) and bool(who_at[table_id]) and all(o.side == r.side for o in who_at[table_id])

    for r in todo:
        need = party_size(r) - seated_of.get(r.id, 0)
        room = [tid for tid in order if free[tid] >= need]
        pick = (
            next((tid for tid in room if same_group(tid, r)), None)
            or next((tid for tid in room if same_side_only(tid, r)), None)
            or next((tid for tid in room if not who_at[tid]), None)
            or (room[0] if room else None)
        )
        if pick:
            new_rows.append((r.id, pick, need))
            free[pick] -= need
            who_at[pick].append(r)
            placed += 1
            continue
        if need > max_cap:
            ordered = [tid for tid in order if not who_at[tid]] + order
            seen = set()
            parts = []
            for tid in ordered:
                if tid in seen or need <= 0:
                    continue
                seen.add(tid)
                if free[tid] > 0:
                    n = min(free[tid], need)
                    parts.append((r.id, tid, n))
                    need -= n
            if need == 0:
                for row in parts:
                    new_rows.append(row)
                    free[row[1]] -= row[2]
                    who_at[row[1]].append(r)
                placed += 1
                split += 1
                continue
        left += 1
    return new_rows, placed, split, left


@router.post("/events/{event_id}/seating/auto-assign", response_model=schemas.AutoAssignResult)
def run_auto_assign(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.AutoAssignResult:
    event = _seating_event(db, event_id, user)
    recipients = list(_event_recipients(db, event.id).values())
    recipients.sort(key=lambda r: r.created_at or datetime.min)
    tables = _tables(db, event.id)
    current = _assignments(db, event.id)
    existing = [(a.recipient_id, a.table_id, a.seats) for a in current]
    new_rows, placed, split, left = auto_assign(recipients, tables, existing)

    # A party that already had some seats gets its new seats merged into
    # the same table row when the table matches (unique per recipient+table).
    by_key = {(a.recipient_id, a.table_id): a for a in current}
    for recipient_id, table_id, seats in new_rows:
        row = by_key.get((recipient_id, table_id))
        if row is not None:
            row.seats += seats
        else:
            row = models.SeatingAssignment(recipient_id=recipient_id, table_id=table_id, seats=seats)
            db.add(row)
            by_key[(recipient_id, table_id)] = row
    audit(
        db, user, "seating.auto_assign", "event", event.id, label=event.title,
        meta={"placed": placed, "split": split, "left": left},
    )
    db.commit()
    return schemas.AutoAssignResult(state=_state(db, event), placed=placed, split=split, left=left)


# --- seating groups (side + group) ------------------------------------------


@router.patch("/events/{event_id}/recipients/grouping", response_model=list[schemas.RecipientOut])
def update_grouping(
    event_id: str,
    body: schemas.GroupingUpdate,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.InvitationRecipient]:
    """Bulk set side and/or group. Works whether or not seating is on —
    groups are also used for filtering and exports."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    sent = body.model_fields_set
    if not ({"side", "group_label"} & sent):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    recipients = (
        db.query(models.InvitationRecipient)
        .filter(
            models.InvitationRecipient.event_id == event.id,
            models.InvitationRecipient.id.in_(body.recipient_ids),
        )
        .all()
    )
    if len(recipients) != len(set(body.recipient_ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invitee not found in this event")
    group = (body.group_label or "").strip() or None
    for r in recipients:
        if "side" in sent:
            r.side = body.side
        if "group_label" in sent:
            r.group_label = group
    db.commit()
    return recipients


@router.get("/events/{event_id}/groups", response_model=schemas.GroupNames)
def list_group_names(
    event_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.GroupNames:
    """Group names already used in this event, per side, for type-ahead."""
    event = _get_event_or_404(db, event_id)
    _require_event_access(event, user)
    names: dict[str, set[str]] = {"groom": set(), "bride": set(), "both": set(), "none": set()}
    for side, label in db.query(
        models.InvitationRecipient.side, models.InvitationRecipient.group_label
    ).filter(models.InvitationRecipient.event_id == event.id):
        label = (label or "").strip()
        if label:
            names[side.value if side else "none"].add(label)
    return schemas.GroupNames(**{k: sorted(v) for k, v in names.items()})
