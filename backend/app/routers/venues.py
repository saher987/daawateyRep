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
    _: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> list[models.Venue]:
    return list(db.query(models.Venue).order_by(models.Venue.name).all())


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


@router.get("/venues/{venue_id}", response_model=schemas.VenueOut)
def get_venue(
    venue_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Venue:
    venue = db.get(models.Venue, venue_id)
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Venue not found")
    is_privileged = user.role in (models.Role.admin, models.Role.manager)
    if not is_privileged and user.email not in venue.owner_emails:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authorized for this venue")
    return venue
