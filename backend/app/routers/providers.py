"""Event professionals directory (photographers, makeup artists, suit
shops, ...). Two halves:

- Public, no auth (/api/provider-categories, /api/providers...): the
  directory itself — only active categories and published providers ever
  come back. Public on purpose, so a provider's page link can be shared on
  WhatsApp and opened by anyone, app or no app.
- Self-listing (/api/my-providers): any signed-in user can submit their
  own business ("List your business"). A new submission is hidden until an
  admin/manager approves it; the owner can keep editing it afterwards (an
  edit puts it back in the review queue, but an already-approved listing
  stays live meanwhile — admins can still hide it).
- Management (/api/manage/...): admin + manager add/edit/hide everything
  and review submissions; permanent deletion is admin-only, same split as
  venues."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_app_user, require_role
from app.db import get_db
from app.integrations.push import send_push_to_user

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


# Enough for someone running a couple of businesses, small enough that one
# account can't flood the review queue.
_MAX_LISTINGS_PER_USER = 5


def _clean_provider_data(db: Session, body: schemas.ProviderDetailsIn) -> dict:
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


# --- self-listing ------------------------------------------------------------


def _display_name(user: models.User) -> str:
    name = " ".join(p for p in (user.first_name, user.last_name) if p)
    return name or user.phone or user.email


def _notify_privileged(db: Session, title: str, message: str) -> None:
    """In-app notification to every admin/manager, same as event requests."""
    privileged = (
        db.query(models.User)
        .filter(
            models.User.role.in_([models.Role.admin, models.Role.manager]),
            models.User.is_active.is_(True),
        )
        .all()
    )
    for admin in privileged:
        db.add(
            models.Notification(
                type=models.NotificationType.event_update,
                title=title,
                message=message,
                is_read=False,
                target_user_email=admin.email,
            )
        )


def _get_own_provider_or_404(db: Session, user: models.User, provider_id: str) -> models.Provider:
    provider = db.get(models.Provider, provider_id)
    if provider is None or provider.owner_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.get("/my-providers", response_model=list[schemas.ProviderOwnerOut])
def list_my_providers(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> list[models.Provider]:
    return list(
        db.query(models.Provider)
        .filter(models.Provider.owner_user_id == user.id)
        .order_by(models.Provider.created_at.desc())
        .all()
    )


@router.get("/my-providers/{provider_id}", response_model=schemas.ProviderOwnerOut)
def get_my_provider(
    provider_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Provider:
    return _get_own_provider_or_404(db, user, provider_id)


@router.post(
    "/my-providers",
    response_model=schemas.ProviderOwnerOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_provider(
    body: schemas.ProviderSubmitIn,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Provider:
    owned = db.query(models.Provider).filter(models.Provider.owner_user_id == user.id).count()
    if owned >= _MAX_LISTINGS_PER_USER:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="listing_limit_reached")
    category = db.get(models.ProviderCategory, body.category_id)
    if category is None or not category.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown category")
    provider = models.Provider(
        **_clean_provider_data(db, body),
        owner_user_id=user.id,
        is_published=False,
        is_featured=False,
        review_status="pending",
    )
    db.add(provider)
    _notify_privileged(
        db,
        "طلب إضافة خدمة جديد",
        f'{_display_name(user)} يطلب إضافة "{provider.name}" إلى صفحة الخدمات',
    )
    db.commit()
    db.refresh(provider)
    return provider


@router.put("/my-providers/{provider_id}", response_model=schemas.ProviderOwnerOut)
def update_my_provider(
    provider_id: str,
    body: schemas.ProviderSubmitIn,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> models.Provider:
    provider = _get_own_provider_or_404(db, user, provider_id)
    # The current category is fine even if admins have since hidden it;
    # switching to a hidden one isn't.
    if body.category_id != provider.category_id:
        category = db.get(models.ProviderCategory, body.category_id)
        if category is None or not category.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown category")
    for field, value in _clean_provider_data(db, body).items():
        setattr(provider, field, value)
    was_pending = provider.review_status == "pending"
    provider.review_status = "pending"
    provider.review_note = None
    if not was_pending:
        _notify_privileged(
            db,
            "تعديل على خدمة",
            f'{_display_name(user)} عدّل "{provider.name}" — بانتظار المراجعة',
        )
    db.commit()
    db.refresh(provider)
    return provider


@router.delete("/my-providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_provider(
    provider_id: str,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> None:
    """The owner taking their own listing down — their business, their call."""
    db.delete(_get_own_provider_or_404(db, user, provider_id))
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


def _admin_out(
    provider: models.Provider, clicks: dict[str, int], owner: models.User | None
) -> schemas.ProviderAdminOut:
    out = schemas.ProviderAdminOut.model_validate(provider)
    out.clicks = clicks
    if owner is not None:
        out.owner_user_id = owner.id
        out.owner_name = _display_name(owner)
        out.owner_phone = owner.phone
    return out


def _owner_of(db: Session, provider: models.Provider) -> models.User | None:
    return db.get(models.User, provider.owner_user_id) if provider.owner_user_id else None


@router.get("/manage/providers", response_model=list[schemas.ProviderAdminOut])
def list_all_providers(
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> list[schemas.ProviderAdminOut]:
    clicks = _clicks_by_provider(db)
    providers = db.query(models.Provider).order_by(models.Provider.created_at.desc()).all()
    owner_ids = {p.owner_user_id for p in providers if p.owner_user_id}
    owners = (
        {u.id: u for u in db.query(models.User).filter(models.User.id.in_(owner_ids))}
        if owner_ids
        else {}
    )
    return [
        _admin_out(p, clicks.get(p.id, {}), owners.get(p.owner_user_id)) for p in providers
    ]


@router.get("/manage/providers/{provider_id}", response_model=schemas.ProviderAdminOut)
def get_provider(
    provider_id: str,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderAdminOut:
    provider = _get_provider_or_404(db, provider_id)
    return _admin_out(provider, _clicks_by_provider(db).get(provider.id, {}), _owner_of(db, provider))


@router.post("/manage/providers/{provider_id}/review", response_model=schemas.ProviderAdminOut)
def review_provider(
    provider_id: str,
    body: schemas.ProviderReviewIn,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.ProviderAdminOut:
    """Approve publishes the listing; reject hides it and leaves the note
    for the owner, who can fix it and resubmit by editing."""
    provider = _get_provider_or_404(db, provider_id)
    approved = body.action == "approve"
    provider.review_status = "approved" if approved else "rejected"
    provider.review_note = None if approved else ((body.note or "").strip() or None)
    provider.is_published = approved
    owner = _owner_of(db, provider)
    if owner is not None:
        if approved:
            title = "تمت الموافقة على خدمتك"
            message = f'"{provider.name}" يظهر الآن في صفحة الخدمات'
        else:
            title = "لم تتم الموافقة على خدمتك"
            message = f'"{provider.name}": {provider.review_note}' if provider.review_note else f'"{provider.name}"'
        db.add(
            models.Notification(
                type=models.NotificationType.event_update,
                title=title,
                message=message,
                is_read=False,
                target_user_email=owner.email,
            )
        )
    db.commit()
    db.refresh(provider)
    if owner is not None:
        send_push_to_user(db, owner, title, message, {"path": "/my-business"})
    return _admin_out(provider, _clicks_by_provider(db).get(provider.id, {}), owner)


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
    return _admin_out(provider, {}, None)


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
    return _admin_out(provider, _clicks_by_provider(db).get(provider.id, {}), _owner_of(db, provider))


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
