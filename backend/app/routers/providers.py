"""Event professionals directory (photographers, makeup artists, suit
shops, ...). Two halves:

- Public, no auth (/api/provider-categories, /api/providers...): the
  directory itself — only active categories and published providers ever
  come back. Public on purpose, so a provider's page link can be shared on
  WhatsApp and opened by anyone, app or no app.
- Management (/api/manage/...): admin + manager add/edit/hide everything;
  permanent deletion is admin-only, same split as venues."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import require_role
from app.db import get_db

router = APIRouter(prefix="/api", tags=["providers"])

_privileged = require_role(models.Role.admin, models.Role.manager)
_admin_only = require_role(models.Role.admin)

_URL_FIELDS = ("map_url", "instagram_url", "facebook_url", "website_url", "logo_url", "cover_url")


def _safe_url(value: str | None) -> str | None:
    """These end up as <a href>/<img src> on a public page. Anything that
    isn't plain http(s) gets https:// prepended — so "instagram.com/x"
    still works, and a "javascript:..." value turns into a harmless,
    broken https link instead of running script."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if value.lower().startswith(("http://", "https://")):
        return value
    return "https://" + value


def _clean_provider_data(db: Session, body: schemas.ProviderIn) -> dict:
    if db.get(models.ProviderCategory, body.category_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown category")
    data = body.model_dump()
    for field in _URL_FIELDS:
        data[field] = _safe_url(data[field])
    data["gallery_urls"] = [u for u in (_safe_url(u) for u in data["gallery_urls"]) if u]
    return data


def _category_out(category: models.ProviderCategory, count: int) -> schemas.ProviderCategoryOut:
    out = schemas.ProviderCategoryOut.model_validate(category)
    out.provider_count = count
    return out


def _ordered_categories(db: Session):
    return db.query(models.ProviderCategory).order_by(
        models.ProviderCategory.sort_order, models.ProviderCategory.name_ar
    )


def _provider_counts(db: Session, published_only: bool) -> dict[str, int]:
    q = db.query(models.Provider.category_id, func.count(models.Provider.id))
    if published_only:
        q = q.filter(models.Provider.is_published.is_(True))
    return dict(q.group_by(models.Provider.category_id).all())


def _get_provider_or_404(db: Session, provider_id: str) -> models.Provider:
    provider = db.get(models.Provider, provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


def _get_category_or_404(db: Session, category_id: str) -> models.ProviderCategory:
    category = db.get(models.ProviderCategory, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


# --- public ----------------------------------------------------------------


@router.get("/provider-categories", response_model=list[schemas.ProviderCategoryOut])
def list_public_categories(db: Session = Depends(get_db)) -> list[schemas.ProviderCategoryOut]:
    counts = _provider_counts(db, published_only=True)
    categories = _ordered_categories(db).filter(models.ProviderCategory.is_active.is_(True)).all()
    return [_category_out(c, counts.get(c.id, 0)) for c in categories]


def _published_providers(db: Session):
    return (
        db.query(models.Provider)
        .join(models.ProviderCategory, models.Provider.category_id == models.ProviderCategory.id)
        .filter(models.Provider.is_published.is_(True), models.ProviderCategory.is_active.is_(True))
    )


@router.get("/providers", response_model=list[schemas.ProviderOut])
def list_public_providers(
    category_id: str | None = None,
    city: str | None = None,
    featured: bool = False,
    db: Session = Depends(get_db),
) -> list[models.Provider]:
    q = _published_providers(db)
    if category_id:
        q = q.filter(models.Provider.category_id == category_id)
    if city:
        q = q.filter(models.Provider.city == city)
    if featured:
        q = q.filter(models.Provider.is_featured.is_(True))
    return list(q.order_by(models.Provider.is_featured.desc(), models.Provider.name).all())


@router.get("/providers/{provider_id}", response_model=schemas.ProviderOut)
def get_public_provider(provider_id: str, db: Session = Depends(get_db)) -> models.Provider:
    provider = _published_providers(db).filter(models.Provider.id == provider_id).one_or_none()
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.post("/providers/{provider_id}/contact-clicks", status_code=status.HTTP_204_NO_CONTENT)
def record_contact_click(
    provider_id: str,
    body: schemas.ProviderContactClickIn,
    db: Session = Depends(get_db),
) -> None:
    """Fire-and-forget from the provider page's contact buttons."""
    if _published_providers(db).filter(models.Provider.id == provider_id).count() == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provider not found")
    db.add(models.ProviderContactClick(provider_id=provider_id, kind=body.kind))
    db.commit()


# --- management: categories -------------------------------------------------


@router.get("/manage/provider-categories", response_model=list[schemas.ProviderCategoryOut])
def list_all_categories(
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> list[schemas.ProviderCategoryOut]:
    counts = _provider_counts(db, published_only=False)
    return [_category_out(c, counts.get(c.id, 0)) for c in _ordered_categories(db).all()]


@router.post(
    "/manage/provider-categories",
    response_model=schemas.ProviderCategoryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    body: schemas.ProviderCategoryIn,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderCategoryOut:
    last = db.query(func.max(models.ProviderCategory.sort_order)).scalar()
    category = models.ProviderCategory(**body.model_dump(), sort_order=(last or 0) + 1)
    db.add(category)
    db.commit()
    db.refresh(category)
    return _category_out(category, 0)


# Declared before /{category_id} so "order" isn't read as a category id.
@router.put("/manage/provider-categories/order", status_code=status.HTTP_204_NO_CONTENT)
def reorder_categories(
    body: schemas.ProviderCategoryOrder,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> None:
    """`ids` in display order; categories it leaves out keep their place
    after the listed ones."""
    by_id = {c.id: c for c in db.query(models.ProviderCategory).all()}
    position = 0
    for category_id in body.ids:
        if category_id in by_id:
            by_id.pop(category_id).sort_order = position
            position += 1
    for category in sorted(by_id.values(), key=lambda c: c.sort_order):
        category.sort_order = position
        position += 1
    db.commit()


@router.put("/manage/provider-categories/{category_id}", response_model=schemas.ProviderCategoryOut)
def update_category(
    category_id: str,
    body: schemas.ProviderCategoryIn,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderCategoryOut:
    category = _get_category_or_404(db, category_id)
    for field, value in body.model_dump().items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return _category_out(category, _provider_counts(db, published_only=False).get(category.id, 0))


@router.delete("/manage/provider-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: str,
    _: models.User = Depends(_admin_only),
    db: Session = Depends(get_db),
) -> None:
    category = _get_category_or_404(db, category_id)
    if db.query(models.Provider).filter_by(category_id=category_id).count():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="category_has_providers")
    db.delete(category)
    db.commit()


# --- management: providers --------------------------------------------------


def _clicks_by_provider(db: Session) -> dict[str, dict[str, int]]:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        db.query(
            models.ProviderContactClick.provider_id,
            models.ProviderContactClick.kind,
            func.count(models.ProviderContactClick.id),
        )
        .filter(models.ProviderContactClick.created_at >= since)
        .group_by(models.ProviderContactClick.provider_id, models.ProviderContactClick.kind)
        .all()
    )
    result: dict[str, dict[str, int]] = {}
    for provider_id, kind, count in rows:
        result.setdefault(provider_id, {})[kind] = count
    return result


def _admin_out(provider: models.Provider, clicks: dict[str, int]) -> schemas.ProviderAdminOut:
    out = schemas.ProviderAdminOut.model_validate(provider)
    out.clicks = clicks
    return out


@router.get("/manage/providers", response_model=list[schemas.ProviderAdminOut])
def list_all_providers(
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> list[schemas.ProviderAdminOut]:
    clicks = _clicks_by_provider(db)
    providers = db.query(models.Provider).order_by(models.Provider.created_at.desc()).all()
    return [_admin_out(p, clicks.get(p.id, {})) for p in providers]


@router.get("/manage/providers/{provider_id}", response_model=schemas.ProviderAdminOut)
def get_provider(
    provider_id: str,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderAdminOut:
    provider = _get_provider_or_404(db, provider_id)
    return _admin_out(provider, _clicks_by_provider(db).get(provider.id, {}))


@router.post(
    "/manage/providers",
    response_model=schemas.ProviderAdminOut,
    status_code=status.HTTP_201_CREATED,
)
def create_provider(
    body: schemas.ProviderIn,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderAdminOut:
    provider = models.Provider(**_clean_provider_data(db, body))
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return _admin_out(provider, {})


@router.put("/manage/providers/{provider_id}", response_model=schemas.ProviderAdminOut)
def update_provider(
    provider_id: str,
    body: schemas.ProviderIn,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderAdminOut:
    provider = _get_provider_or_404(db, provider_id)
    for field, value in _clean_provider_data(db, body).items():
        setattr(provider, field, value)
    db.commit()
    db.refresh(provider)
    return _admin_out(provider, _clicks_by_provider(db).get(provider.id, {}))


@router.delete("/manage/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(
    provider_id: str,
    _: models.User = Depends(_admin_only),
    db: Session = Depends(get_db),
) -> None:
    """admin-only, like venues — a manager hides (is_published=false)."""
    provider = _get_provider_or_404(db, provider_id)
    db.delete(provider)
    db.commit()
