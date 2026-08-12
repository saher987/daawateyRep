"""Venues (Flow E backbone). Full venue management (my-venues, the venue
calendar, venue-schedule) is Phase 4 — this is the minimal slice
CreateEvent's venue picker needs: list/create/get, admin+manager write,
same owner_emails per-row read rule as events use for their owners."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user, require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["venues"])


@router.get("/venues", response_model=list[schemas.VenueOut])
def list_venues(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.Venue]:
    """admin/manager see every venue (CreateEvent's picker needs the full
    list). venue_owner sees only venues they're listed on — needed for
    MyVenues.jsx/VenueSchedule.jsx's venue selector — enforced here
    server-side rather than trusting those pages' own client-side
    `.filter(...) by owner_emails` (kept in the ported pages too, but only
    as a redundant check, not the real boundary). Anyone else: 403."""
    if user.role in (models.Role.admin, models.Role.manager):
        return list(db.query(models.Venue).order_by(models.Venue.name).all())
    if user.role == models.Role.venue_owner:
        return list(
            db.query(models.Venue)
            .filter(models.Venue.owner_emails.any(user.email))
            .order_by(models.Venue.name)
            .all()
        )
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized")


@router.post("/venues", response_model=schemas.VenueOut, status_code=status.HTTP_201_CREATED)
def create_venue(
    body: schemas.VenueCreate,
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.Venue:
    venue = models.Venue(**body.model_dump())
    db.add(venue)
    db.commit()
    db.refresh(venue)
    return venue


def _get_venue_or_404(db: Session, venue_id: str) -> models.Venue:
    venue = db.get(models.Venue, venue_id)
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Venue not found")
    return venue


@router.get("/venues/{venue_id}", response_model=schemas.VenueOut)
def get_venue(
    venue_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Venue:
    venue = _get_venue_or_404(db, venue_id)
    is_privileged = user.role in (models.Role.admin, models.Role.manager)
    if not is_privileged and user.email not in venue.owner_emails:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized for this venue")
    return venue


@router.put("/venues/{venue_id}", response_model=schemas.VenueOut)
def update_venue(
    venue_id: str,
    body: schemas.VenueUpdate,
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.Venue:
    """admin/manager only — spec §1 doesn't give venue_owner permission to
    edit their own venue's record, only to view its schedule/calendar."""
    venue = _get_venue_or_404(db, venue_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(venue, field, value)
    db.commit()
    db.refresh(venue)
    return venue


@router.delete("/venues/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_venue(
    venue_id: str,
    _: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> None:
    """admin-only per spec §1 (venues are one of the two admin-only-delete
    exceptions, alongside planned weddings)."""
    venue = _get_venue_or_404(db, venue_id)
    db.delete(venue)
    db.commit()
