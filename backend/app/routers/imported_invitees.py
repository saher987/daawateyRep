"""The saved import list: rows loaded on an event's import page
(ImportInvitees.jsx) are kept per event until their invitation is sent.

Admin/manager only, like everything that sends paid messages. Sending a row
adds the guest and sends the invitation exactly like add_recipient does
(events._add_and_invite), then removes the row; a row that can't be sent
stays with the reason. See models.ImportedInvitee for why this is its own
table.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import audit
from app.auth import require_role
from app.db import get_db
from app.routers.events import _add_and_invite, _get_event_or_404

router = APIRouter(prefix="/api", tags=["imported-invitees"])

_team = require_role(models.Role.admin, models.Role.manager)


def _phone_core(phone: str | None) -> str:
    """Last 9 digits: "0501234567" and "972501234567" are the same number."""
    return re.sub(r"\D", "", phone or "")[-9:]


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


def _rows(db: Session, event_id: str) -> list[models.ImportedInvitee]:
    return (
        db.query(models.ImportedInvitee)
        .filter(models.ImportedInvitee.event_id == event_id)
        .order_by(models.ImportedInvitee.created_at, models.ImportedInvitee.id)
        .all()
    )


def _get_row_or_404(db: Session, row_id: str) -> models.ImportedInvitee:
    row = db.get(models.ImportedInvitee, row_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Imported invitee not found")
    return row


@router.get("/events/{event_id}/imported-invitees", response_model=list[schemas.ImportedInviteeOut])
def list_imported(
    event_id: str,
    _: models.User = Depends(_team),
    db: Session = Depends(get_db),
) -> list[models.ImportedInvitee]:
    _get_event_or_404(db, event_id)
    return _rows(db, event_id)


@router.post("/events/{event_id}/imported-invitees", response_model=schemas.ImportedInviteeSaveResult)
def save_imported(
    event_id: str,
    body: schemas.ImportedInviteeSave,
    user: models.User = Depends(_team),
    db: Session = Depends(get_db),
) -> schemas.ImportedInviteeSaveResult:
    """Saves rows from a file or the manual form. A phone number that is
    already saved for this event, repeated in the file, or already a guest
    of the event is skipped, so loading the same file twice adds nothing.
    Rows without a phone are kept (to be completed) and never count as
    duplicates."""
    event = _get_event_or_404(db, event_id)
    taken = {_phone_core(r.phone) for r in _rows(db, event_id) if r.phone}
    taken |= {
        _phone_core(p)
        for (p,) in db.query(models.InvitationRecipient.phone).filter(
            models.InvitationRecipient.event_id == event_id, models.InvitationRecipient.phone.isnot(None)
        )
    }
    added = skipped = 0
    for guest in body.guests:
        data = guest.model_dump()
        for field in ("nickname", "first_name", "last_name", "name_suffix", "phone", "town", "town_text", "side_text", "group_label"):
            data[field] = _clean(data[field])
        if not any(data[f] for f in ("nickname", "first_name", "last_name", "phone")):
            continue
        core = _phone_core(data["phone"])
        if core:
            if core in taken:
                skipped += 1
                continue
            taken.add(core)
        db.add(models.ImportedInvitee(event_id=event_id, **data))
        added += 1
    if added:
        audit(db, user, "event.import_save", "event", event.id, label=event.title, meta={"added": added, "skipped": skipped})
    db.commit()
    return schemas.ImportedInviteeSaveResult(added=added, skipped=skipped, rows=_rows(db, event_id))


@router.put("/imported-invitees/{row_id}", response_model=schemas.ImportedInviteeOut)
def update_imported(
    row_id: str,
    body: schemas.ImportedInviteeIn,
    _: models.User = Depends(_team),
    db: Session = Depends(get_db),
) -> models.ImportedInvitee:
    """The import page's edit form. Refuses a phone another saved row of
    the event already has."""
    row = _get_row_or_404(db, row_id)
    data = body.model_dump()
    for field in ("nickname", "first_name", "last_name", "name_suffix", "phone", "town", "town_text", "side_text", "group_label"):
        data[field] = _clean(data[field])
    core = _phone_core(data["phone"])
    if core and any(r.id != row.id and _phone_core(r.phone) == core for r in _rows(db, row.event_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="phone_already_saved")
    for field, value in data.items():
        setattr(row, field, value)
    row.last_error = None
    db.commit()
    db.refresh(row)
    return row


@router.delete("/imported-invitees/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_imported(
    row_id: str,
    _: models.User = Depends(_team),
    db: Session = Depends(get_db),
) -> None:
    db.delete(_get_row_or_404(db, row_id))
    db.commit()


@router.post("/events/{event_id}/imported-invitees/send", response_model=schemas.ImportedInviteeSendResult)
def send_imported(
    event_id: str,
    body: schemas.ImportedInviteeSend,
    user: models.User = Depends(_team),
    db: Session = Depends(get_db),
) -> schemas.ImportedInviteeSendResult:
    """Sends the invitation to one batch of saved rows (a single row's
    «إرسال دعوة», or one batch of «إرسال الدعوات للجميع»). A row whose
    invitation went out becomes a guest of the event and leaves this list;
    so does one whose phone is already a guest. A row without a phone, or
    whose message wasn't delivered, stays with the reason."""
    event = _get_event_or_404(db, event_id)
    found = {
        r.id: r
        for r in db.query(models.ImportedInvitee).filter(
            models.ImportedInvitee.id.in_(body.ids), models.ImportedInvitee.event_id == event_id
        )
    }
    results: list[schemas.ImportedInviteeSendItem] = []
    for row_id in body.ids:
        row = found.get(row_id)
        if row is None:
            results.append(schemas.ImportedInviteeSendItem(id=row_id, success=False, error="not_found"))
            continue
        if not row.phone:
            row.last_error = "no_phone"
            db.commit()
            results.append(schemas.ImportedInviteeSendItem(id=row_id, success=False, error="no_phone"))
            continue
        guest = schemas.RecipientCreate(
            nickname=row.nickname,
            first_name=row.first_name,
            last_name=row.last_name,
            name_suffix=row.name_suffix,
            phone=row.phone,
            guests_count=row.guests_count,
            side=row.side,
            group_label=row.group_label,
            town=row.town,
        )
        try:
            recipient = _add_and_invite(db, event, user, guest, batch=True, require_delivery=True)
        except HTTPException as exc:
            db.rollback()
            row = db.get(models.ImportedInvitee, row_id)
            if exc.status_code == status.HTTP_409_CONFLICT:
                db.delete(row)
                db.commit()
                results.append(schemas.ImportedInviteeSendItem(id=row_id, success=True, already_invited=True))
            else:
                row.last_error = str(exc.detail)
                db.commit()
                results.append(schemas.ImportedInviteeSendItem(id=row_id, success=False, error=str(exc.detail)))
            continue
        recipient_id = recipient.id
        db.delete(db.get(models.ImportedInvitee, row_id))
        db.commit()
        results.append(schemas.ImportedInviteeSendItem(id=row_id, success=True, recipient_id=recipient_id))
    return schemas.ImportedInviteeSendResult(results=results)
