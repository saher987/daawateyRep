"""Flow E: future-wedding leads, surfaced to venue owners (filtered to
their city client-side) to spot potential bookings. Permissions match the
original entity's RLS block exactly: admin/manager/venue_owner can all
read, only admin/manager can create/update, only admin can delete."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import audit, changes_since, snapshot
from app.auth import require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["planned-weddings"])


def _label(wedding: models.PlannedWedding) -> str:
    return f"{wedding.owner_name} — {wedding.date}"


@router.get("/planned-weddings", response_model=list[schemas.PlannedWeddingOut])
def list_planned_weddings(
    _: models.User = Depends(
        require_role(models.Role.admin, models.Role.manager, models.Role.venue_owner)
    ),
    db: Session = Depends(get_db),
) -> list[models.PlannedWedding]:
    return list(db.query(models.PlannedWedding).order_by(models.PlannedWedding.date).all())


@router.post(
    "/planned-weddings", response_model=schemas.PlannedWeddingOut, status_code=status.HTTP_201_CREATED
)
def create_planned_wedding(
    body: schemas.PlannedWeddingCreate,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.PlannedWedding:
    wedding = models.PlannedWedding(**body.model_dump())
    db.add(wedding)
    db.flush()
    audit(db, user, "planned_wedding.create", "planned_wedding", wedding.id, label=_label(wedding))
    db.commit()
    db.refresh(wedding)
    return wedding


@router.put("/planned-weddings/{wedding_id}", response_model=schemas.PlannedWeddingOut)
def update_planned_wedding(
    wedding_id: str,
    body: schemas.PlannedWeddingUpdate,
    user: models.User = Depends(require_role(models.Role.admin, models.Role.manager)),
    db: Session = Depends(get_db),
) -> models.PlannedWedding:
    wedding = db.get(models.PlannedWedding, wedding_id)
    if wedding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Planned wedding not found")
    fields = body.model_dump(exclude_unset=True)
    before = snapshot(wedding, fields)
    for field, value in fields.items():
        setattr(wedding, field, value)
    changes = changes_since(before, wedding)
    if changes:
        audit(
            db,
            user,
            "planned_wedding.update",
            "planned_wedding",
            wedding.id,
            label=_label(wedding),
            changes=changes,
        )
    db.commit()
    db.refresh(wedding)
    return wedding


@router.delete("/planned-weddings/{wedding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_planned_wedding(
    wedding_id: str,
    user: models.User = Depends(require_role(models.Role.admin)),
    db: Session = Depends(get_db),
) -> None:
    wedding = db.get(models.PlannedWedding, wedding_id)
    if wedding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Planned wedding not found")
    audit(db, user, "planned_wedding.delete", "planned_wedding", wedding.id, label=_label(wedding))
    db.delete(wedding)
    db.commit()
