"""Affiliate program: outside partners (wedding planners, photographers,
...) refer customers with a personal code and earn a commission on the
customer's first paid event.

- Public (/api/affiliates/code/{code}): the name behind a code, for the
  /r/<code> landing page and RequestEventDialog's "you came through ..."
  line.
- Signed-in: claim a referral after following a /r/<code> link
  (ReferralLanding / AuthContext), apply to become a partner
  (BecomePartner), and the affiliate's own "My referrals" page.
- Team (/api/manage/..., admin + manager): the Affiliates page — add,
  edit and approve affiliates, approve or reject commissions, monthly
  payouts — and the payment card on EventDetails (/api/events/{id}/payment),
  where marking an event paid creates the commission.

The rules (shareholders' agreement, section 8):
- 20% (commission_pct) of the customer's first paid event; later events
  pay repeat_pct (default 0, so nothing);
- only once the team marks the event paid;
- the event was created within REFERRAL_WINDOW_DAYS of the referral, and
  the first referral of a phone wins;
- no self-referral; shareholders (Affiliate.excluded) and their venues
  (Venue.affiliate_excluded) never earn a commission;
- payouts once a month, from MIN_PAYOUT up.
"""

import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import audit, changes_since, snapshot
from app.auth import get_app_user, require_role
from app.db import get_db
from app.integrations.pulseem import find_by_phone, send_sms, to_international_phone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["affiliates"])

_privileged = require_role(models.Role.admin, models.Role.manager)
_admin_only = require_role(models.Role.admin)

REFERRAL_WINDOW_DAYS = 60
MIN_PAYOUT = 100.0
_CODE_RE = re.compile(r"^[A-Z0-9]{3,16}$")

# Where the "new partner application" notification leads (Affiliates.jsx).
AFFILIATES_PATH = "/affiliates"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    # created_at defaults are naive utcnow (models.py); compare as UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _app_url() -> str:
    return os.environ.get("APP_URL", "https://daawatey.com")


def referral_link(code: str) -> str:
    return f"{_app_url()}/r/{code}"


def _clean_code(code: str | None) -> str | None:
    if code is None:
        return None
    code = re.sub(r"\s+", "", code).upper()
    return code or None


def _make_code(db: Session, name: str, pct: int) -> str:
    """DANA20-style: the Latin letters of the name plus the percent. Arabic
    and Hebrew names have none, so those get DW + 4 digits; either way a
    taken code gets digits added until it's free."""
    letters = re.sub(r"[^A-Za-z]", "", name).upper()[:8]
    base = f"{letters}{pct}" if len(letters) >= 3 else f"DW{secrets.randbelow(9000) + 1000}"
    code = base
    while db.query(models.Affiliate.id).filter(models.Affiliate.code == code).first():
        code = f"{base}{secrets.randbelow(90) + 10}"
    return code


def _check_code(db: Session, code: str, affiliate_id: str | None = None) -> str:
    if not _CODE_RE.match(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_code")
    taken = db.query(models.Affiliate).filter(models.Affiliate.code == code).first()
    if taken is not None and taken.id != affiliate_id:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="code_taken")
    return code


def active_by_code(db: Session, code: str | None) -> models.Affiliate | None:
    code = _clean_code(code)
    if not code:
        return None
    return (
        db.query(models.Affiliate)
        .filter(models.Affiliate.code == code, models.Affiliate.status == "active")
        .first()
    )


def affiliate_for_user(db: Session, user: models.User) -> models.Affiliate | None:
    if not user.phone:
        return None
    return db.query(models.Affiliate).filter(models.Affiliate.phone == to_international_phone(user.phone)).first()


def _send_welcome_sms(affiliate: models.Affiliate) -> bool:
    """Code, link and how it works. Arabic, the app's default language.
    send_sms never raises; False when it didn't go out."""
    text = (
        f"مرحباً {affiliate.name}، انضممت إلى برنامج شركاء دعوتي.\n"
        f"الكود الخاص بك: {affiliate.code}\n"
        f"الرابط: {referral_link(affiliate.code)}\n"
        f"لكل زبون جديد يحجز عن طريقك تحصل على {affiliate.commission_pct}% من مناسبته الأولى. "
        "تابع الإحالات في التطبيق: «إحالاتي»."
    )
    return send_sms(affiliate.phone, text, reference=f"affiliate-{affiliate.id}")


def create_referral(
    db: Session, affiliate: models.Affiliate, phone: str, source: str, name: str | None = None
) -> str:
    """created / exists / self. Never replaces an existing referral: the
    first one for a phone wins."""
    phone = to_international_phone(phone)
    if phone == affiliate.phone:
        return "self"
    if db.query(models.Referral.id).filter(models.Referral.phone == phone).first():
        return "exists"
    try:
        # A savepoint, so losing a race doesn't roll back the caller's
        # other changes (an event request, a price).
        with db.begin_nested():
            db.add(models.Referral(affiliate_id=affiliate.id, phone=phone, name=name, source=source))
    except IntegrityError:
        # Two claims for one phone at once: the other one won.
        return "exists"
    return "created"


# --- Stats ---------------------------------------------------------------


def _with_stats(db: Session, affiliates: list[models.Affiliate]) -> list[schemas.AffiliateOut]:
    ids = [a.id for a in affiliates]
    customers = dict(
        db.query(models.Referral.affiliate_id, func.count(models.Referral.id))
        .filter(models.Referral.affiliate_id.in_(ids))
        .group_by(models.Referral.affiliate_id)
        .all()
    )
    sums: dict[tuple[str, str], tuple[int, float]] = {}
    for affiliate_id, status_, count, total in (
        db.query(
            models.AffiliateCommission.affiliate_id,
            models.AffiliateCommission.status,
            func.count(models.AffiliateCommission.id),
            func.coalesce(func.sum(models.AffiliateCommission.amount), 0),
        )
        .filter(models.AffiliateCommission.affiliate_id.in_(ids))
        .group_by(models.AffiliateCommission.affiliate_id, models.AffiliateCommission.status)
        .all()
    ):
        sums[(affiliate_id, status_)] = (count, float(total))
    out = []
    for a in affiliates:
        item = schemas.AffiliateOut.model_validate(a)
        item.customers = customers.get(a.id, 0)
        item.paid_events = sum(sums.get((a.id, s), (0, 0))[0] for s in ("pending", "approved", "paid"))
        item.pending_amount = sums.get((a.id, "pending"), (0, 0.0))[1]
        item.approved_amount = sums.get((a.id, "approved"), (0, 0.0))[1]
        item.paid_amount = sums.get((a.id, "paid"), (0, 0.0))[1]
        out.append(item)
    return out


def _commission_out(c: models.AffiliateCommission, affiliate: models.Affiliate | None) -> schemas.CommissionOut:
    out = schemas.CommissionOut.model_validate(c)
    if affiliate is not None:
        out.affiliate_name = affiliate.name
        out.affiliate_code = affiliate.code
    return out


# --- Commission rules ----------------------------------------------------


def _referral_for_event(db: Session, event: models.Event) -> models.Referral | None:
    phones = [p for p in event.owner_phones if p]
    if not phones:
        return None
    return (
        db.query(models.Referral)
        .filter(models.Referral.phone.in_(phones))
        .order_by(models.Referral.created_at)
        .first()
    )


def evaluate_commission(
    db: Session, event: models.Event, referral: models.Referral | None
) -> tuple[models.AffiliateCommission | None, list[schemas.PaymentCheck], str | None]:
    """The commission the event's referral earns, unsaved, or None with the
    first rule that failed. The checks are what the payment card lists."""
    checks: list[schemas.PaymentCheck] = []
    if referral is None:
        return None, checks, "no_referral"
    affiliate = db.get(models.Affiliate, referral.affiliate_id)
    if affiliate is None or affiliate.status != "active":
        return None, checks, "affiliate_inactive"

    earlier = (
        db.query(models.AffiliateCommission.id)
        .filter(
            models.AffiliateCommission.referral_id == referral.id,
            models.AffiliateCommission.event_id != event.id,
            models.AffiliateCommission.status != "rejected",
        )
        .first()
    )
    is_first = earlier is None
    pct = affiliate.commission_pct if is_first else affiliate.repeat_pct
    venue = db.get(models.Venue, event.venue_id) if event.venue_id else None
    event_created = _aware(event.created_at) or _now()
    in_window = event_created <= _aware(referral.created_at) + timedelta(days=REFERRAL_WINDOW_DAYS)

    rules = [
        ("first_event", is_first or pct > 0),
        ("in_window", in_window),
        ("not_self", affiliate.phone not in event.owner_phones),
        ("not_excluded", not affiliate.excluded and not (venue and venue.affiliate_excluded)),
        ("has_price", bool(event.price) and float(event.price) > 0),
    ]
    checks = [schemas.PaymentCheck(key=k, ok=ok) for k, ok in rules]
    failed = next((k for k, ok in rules if not ok), None)
    if failed:
        return None, checks, failed

    price = float(event.price)
    owner = find_by_phone(db, models.User, referral.phone)
    owner_name = owner.first_name if owner else None
    commission = models.AffiliateCommission(
        affiliate_id=affiliate.id,
        referral_id=referral.id,
        event_id=event.id,
        event_title=event.title,
        event_date=event.date,
        customer_name=owner_name or referral.name,
        event_price=price,
        pct=pct,
        amount=round(price * pct / 100, 2),
        is_first=is_first,
        status="pending",
    )
    return commission, checks, None


# --- Public --------------------------------------------------------------


@router.get("/affiliates/code/{code}", response_model=schemas.AffiliatePublicOut)
def affiliate_by_code(code: str, db: Session = Depends(get_db)) -> schemas.AffiliatePublicOut:
    affiliate = active_by_code(db, code)
    if affiliate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown code")
    return schemas.AffiliatePublicOut(code=affiliate.code, name=affiliate.name, kind=affiliate.kind)


# --- Signed-in -----------------------------------------------------------


@router.post("/referrals/claim", response_model=schemas.ReferralClaimOut)
def claim_referral(
    body: schemas.ReferralClaim,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.ReferralClaimOut:
    """After a /r/<code> link: the code waits on the phone (lib/referral.js)
    until someone signs in, then ties their phone to the affiliate."""
    affiliate = active_by_code(db, body.code)
    if affiliate is None:
        return schemas.ReferralClaimOut(result="invalid")
    if not user.phone:
        return schemas.ReferralClaimOut(result="no_phone")
    result = create_referral(db, affiliate, user.phone, "link", name=user.first_name)
    if result == "created":
        audit(db, user, "referral.claim", "affiliate", affiliate.id, label=affiliate.code)
        db.commit()
    return schemas.ReferralClaimOut(result=result)


@router.get("/my-affiliate", response_model=schemas.MyAffiliateOut)
def my_affiliate(
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.MyAffiliateOut:
    """The "My referrals" page: the affiliate's code, link, totals and
    customers. Found by the signed-in user's phone."""
    affiliate = affiliate_for_user(db, user)
    if affiliate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not an affiliate")
    referrals = (
        db.query(models.Referral)
        .filter(models.Referral.affiliate_id == affiliate.id)
        .order_by(models.Referral.created_at.desc())
        .all()
    )
    commissions = (
        db.query(models.AffiliateCommission)
        .filter(models.AffiliateCommission.affiliate_id == affiliate.id)
        .order_by(models.AffiliateCommission.created_at.desc())
        .all()
    )
    by_referral: dict[str, models.AffiliateCommission] = {}
    for c in commissions:
        if c.referral_id and c.referral_id not in by_referral:
            by_referral[c.referral_id] = c
    rows = []
    for r in referrals:
        c = by_referral.get(r.id)
        name = (c.customer_name if c else None) or r.name
        rows.append(
            schemas.MyReferralOut(
                # First name only, whatever was stored.
                name=name.split()[0] if name else None,
                created_at=r.created_at,
                event_title=c.event_title if c else None,
                event_date=c.event_date if c else None,
                commission_status=c.status if c else None,
                amount=float(c.amount) if c else None,
            )
        )
    return schemas.MyAffiliateOut(
        affiliate=_with_stats(db, [affiliate])[0],
        link=referral_link(affiliate.code),
        referrals=rows,
        min_payout=MIN_PAYOUT,
        window_days=REFERRAL_WINDOW_DAYS,
    )


@router.post("/affiliate-applications", response_model=schemas.AffiliateOut, status_code=status.HTTP_201_CREATED)
def apply_as_affiliate(
    body: schemas.AffiliateApplication,
    user: models.User = Depends(get_app_user),
    db: Session = Depends(get_db),
) -> schemas.AffiliateOut:
    """BecomePartner: a pending affiliate the team approves on the
    Affiliates page. Needs a phone on the account — that's how the
    affiliate is found and paid."""
    if not body.accepted_terms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="terms_not_accepted")
    if not user.phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="phone_required")
    if affiliate_for_user(db, user) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_applied")
    code = _clean_code(body.code)
    code = _check_code(db, code) if code else _make_code(db, body.name, 20)
    affiliate = models.Affiliate(
        name=body.name.strip(),
        phone=to_international_phone(user.phone),
        kind=body.kind,
        code=code,
        status="pending",
        application_note=body.note,
        accepted_terms_at=_now(),
    )
    db.add(affiliate)
    db.flush()
    audit(db, user, "affiliate.apply", "affiliate", affiliate.id, label=affiliate.name, meta={"code": code})
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
                title="طلب انضمام لبرنامج الشركاء",
                message=f"{affiliate.name} يطلب الانضمام كشريك",
                is_read=False,
                target_user_email=admin.email,
                link=AFFILIATES_PATH,
            )
        )
    db.commit()
    db.refresh(affiliate)
    return _with_stats(db, [affiliate])[0]


# --- Team: affiliates ----------------------------------------------------


@router.get("/manage/affiliates", response_model=list[schemas.AffiliateOut])
def list_affiliates(
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> list[schemas.AffiliateOut]:
    affiliates = db.query(models.Affiliate).order_by(models.Affiliate.created_at.desc()).all()
    return _with_stats(db, affiliates)


@router.post("/manage/affiliates", response_model=schemas.AffiliateOut, status_code=status.HTTP_201_CREATED)
def create_affiliate(
    body: schemas.AffiliateCreate,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.AffiliateOut:
    phone = to_international_phone(body.phone)
    if db.query(models.Affiliate.id).filter(models.Affiliate.phone == phone).first():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="phone_taken")
    code = _clean_code(body.code)
    code = _check_code(db, code) if code else _make_code(db, body.name, body.commission_pct)
    affiliate = models.Affiliate(
        name=body.name.strip(),
        phone=phone,
        kind=body.kind,
        code=code,
        commission_pct=body.commission_pct,
        repeat_pct=body.repeat_pct,
        excluded=body.excluded,
        status="active",
        approved_at=_now(),
    )
    db.add(affiliate)
    db.flush()
    audit(db, user, "affiliate.create", "affiliate", affiliate.id, label=affiliate.name, meta={"code": code})
    db.commit()
    db.refresh(affiliate)
    out = _with_stats(db, [affiliate])[0]
    if body.send_sms:
        out.sms_sent = _send_welcome_sms(affiliate)
    return out


@router.put("/manage/affiliates/{affiliate_id}", response_model=schemas.AffiliateOut)
def update_affiliate(
    affiliate_id: str,
    body: schemas.AffiliateUpdate,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.AffiliateOut:
    affiliate = _get_affiliate_or_404(db, affiliate_id)
    fields = body.model_dump(exclude_unset=True)
    if "code" in fields:
        code = _clean_code(fields["code"])
        if not code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_code")
        fields["code"] = _check_code(db, code, affiliate.id)
    before = snapshot(affiliate, fields)
    for field, value in fields.items():
        setattr(affiliate, field, value)
    if fields.get("status") == "active" and affiliate.approved_at is None:
        affiliate.approved_at = _now()
    changes = changes_since(before, affiliate)
    if changes:
        audit(db, user, "affiliate.update", "affiliate", affiliate.id, label=affiliate.name, changes=changes)
    db.commit()
    db.refresh(affiliate)
    return _with_stats(db, [affiliate])[0]


@router.post("/manage/affiliates/{affiliate_id}/review", response_model=schemas.AffiliateOut)
def review_affiliate(
    affiliate_id: str,
    body: schemas.AffiliateReview,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.AffiliateOut:
    """Approve or reject an application from BecomePartner."""
    affiliate = _get_affiliate_or_404(db, affiliate_id)
    affiliate.status = "active" if body.action == "approve" else "rejected"
    if body.action == "approve":
        affiliate.approved_at = _now()
    audit(db, user, f"affiliate.{body.action}", "affiliate", affiliate.id, label=affiliate.name)
    db.commit()
    db.refresh(affiliate)
    out = _with_stats(db, [affiliate])[0]
    if body.action == "approve" and body.send_sms:
        out.sms_sent = _send_welcome_sms(affiliate)
    return out


@router.delete("/manage/affiliates/{affiliate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_affiliate(
    affiliate_id: str,
    user: models.User = Depends(_admin_only),
    db: Session = Depends(get_db),
) -> None:
    """Admin only, and only without commissions — those stay on the books;
    set the affiliate inactive instead."""
    affiliate = _get_affiliate_or_404(db, affiliate_id)
    if (
        db.query(models.AffiliateCommission.id)
        .filter(models.AffiliateCommission.affiliate_id == affiliate.id)
        .first()
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="has_commissions")
    audit(db, user, "affiliate.delete", "affiliate", affiliate.id, label=affiliate.name)
    db.delete(affiliate)
    db.commit()


def _get_affiliate_or_404(db: Session, affiliate_id: str) -> models.Affiliate:
    affiliate = db.get(models.Affiliate, affiliate_id)
    if affiliate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Affiliate not found")
    return affiliate


@router.put("/manage/venues/{venue_id}/affiliate-excluded", response_model=schemas.VenueOut)
def set_venue_affiliate_excluded(
    venue_id: str,
    body: schemas.VenueAffiliateExcluded,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> models.Venue:
    """A shareholder's venue: its events never earn a commission. Set on
    the Affiliates page, not the venue form, which venue owners can edit."""
    venue = db.get(models.Venue, venue_id)
    if venue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Venue not found")
    if venue.affiliate_excluded != body.affiliate_excluded:
        audit(
            db,
            user,
            "venue.affiliate_excluded",
            "venue",
            venue.id,
            label=venue.name,
            changes={"affiliate_excluded": [venue.affiliate_excluded, body.affiliate_excluded]},
        )
        venue.affiliate_excluded = body.affiliate_excluded
        db.commit()
        db.refresh(venue)
    return venue


# --- Team: commissions and payouts ----------------------------------------


@router.get("/manage/affiliate-commissions", response_model=list[schemas.CommissionOut])
def list_commissions(
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> list[schemas.CommissionOut]:
    rows = (
        db.query(models.AffiliateCommission, models.Affiliate)
        .join(models.Affiliate, models.Affiliate.id == models.AffiliateCommission.affiliate_id)
        .order_by(models.AffiliateCommission.created_at.desc())
        .all()
    )
    return [_commission_out(c, a) for c, a in rows]


@router.post("/manage/affiliate-commissions/{commission_id}/decision", response_model=schemas.CommissionOut)
def decide_commission(
    commission_id: str,
    body: schemas.CommissionDecision,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.CommissionOut:
    commission = db.get(models.AffiliateCommission, commission_id)
    if commission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Commission not found")
    if commission.status == "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_paid")
    new_status = "approved" if body.action == "approve" else "rejected"
    audit(
        db,
        user,
        f"commission.{body.action}",
        "affiliate_commission",
        commission.id,
        label=commission.event_title,
        changes={"status": [commission.status, new_status]},
        meta={"amount": float(commission.amount), "note": body.note},
    )
    commission.status = new_status
    commission.note = body.note
    commission.decided_at = _now()
    db.commit()
    db.refresh(commission)
    return _commission_out(commission, db.get(models.Affiliate, commission.affiliate_id))


@router.post("/manage/affiliate-payouts", response_model=schemas.PayoutResult)
def pay_out(
    body: schemas.PayoutRequest,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.PayoutResult:
    """The team transferred the money (outside the app); this marks the
    approved commissions paid. No ids: everyone at MIN_PAYOUT or more —
    the rest wait for next month."""
    approved = (
        db.query(models.AffiliateCommission)
        .filter(models.AffiliateCommission.status == "approved")
        .all()
    )
    by_affiliate: dict[str, list[models.AffiliateCommission]] = {}
    for c in approved:
        by_affiliate.setdefault(c.affiliate_id, []).append(c)
    if body.affiliate_ids is not None:
        chosen = {aid: cs for aid, cs in by_affiliate.items() if aid in set(body.affiliate_ids)}
    else:
        chosen = {
            aid: cs for aid, cs in by_affiliate.items() if sum(float(c.amount) for c in cs) >= MIN_PAYOUT
        }
    now = _now()
    total = 0.0
    count = 0
    for aid, cs in chosen.items():
        for c in cs:
            c.status = "paid"
            c.paid_at = now
            c.payout_reference = body.reference
            total += float(c.amount)
            count += 1
        affiliate = db.get(models.Affiliate, aid)
        audit(
            db,
            user,
            "affiliate.payout",
            "affiliate",
            aid,
            label=affiliate.name if affiliate else None,
            meta={"commissions": len(cs), "amount": round(sum(float(c.amount) for c in cs), 2), "reference": body.reference},
        )
    db.commit()
    return schemas.PayoutResult(affiliates=len(chosen), commissions=count, total=round(total, 2))


# --- Team: the event's payment card ---------------------------------------


def _payment_out(
    db: Session,
    event: models.Event,
    skipped: str | None = None,
    checks: list[schemas.PaymentCheck] | None = None,
) -> schemas.EventPaymentOut:
    referral = _referral_for_event(db, event)
    affiliate = db.get(models.Affiliate, referral.affiliate_id) if referral else None
    commission = (
        db.query(models.AffiliateCommission).filter(models.AffiliateCommission.event_id == event.id).first()
    )
    if checks is None and referral is not None and commission is None:
        # Before marking paid: what the rules say now.
        _, checks, skipped_now = evaluate_commission(db, event, referral)
        skipped = skipped or (skipped_now if event.paid_at else None)
    return schemas.EventPaymentOut(
        price=float(event.price) if event.price is not None else None,
        paid_at=event.paid_at,
        referral_code=affiliate.code if affiliate else None,
        referral_name=affiliate.name if affiliate else None,
        referral_source=referral.source if referral else None,
        referral_at=referral.created_at if referral else None,
        commission=_commission_out(commission, affiliate) if commission else None,
        commission_skipped=skipped,
        checks=checks or [],
    )


def _get_event_or_404(db: Session, event_id: str) -> models.Event:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.get("/events/{event_id}/payment", response_model=schemas.EventPaymentOut)
def get_event_payment(
    event_id: str,
    _: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.EventPaymentOut:
    return _payment_out(db, _get_event_or_404(db, event_id))


@router.put("/events/{event_id}/payment", response_model=schemas.EventPaymentOut)
def update_event_payment(
    event_id: str,
    body: schemas.EventPaymentUpdate,
    user: models.User = Depends(_privileged),
    db: Session = Depends(get_db),
) -> schemas.EventPaymentOut:
    """Price, paid / not paid, and the referral code when the customer
    came some other way (WhatsApp) and named who sent them. Marking paid
    runs the rules and creates the pending commission; un-marking removes
    a commission that wasn't paid out yet."""
    event = _get_event_or_404(db, event_id)
    fields = body.model_dump(exclude_unset=True)

    if fields.get("referral_code"):
        affiliate = active_by_code(db, fields["referral_code"])
        if affiliate is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_code")
        if not event.owner_phones:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="no_owner_phone")
        if _referral_for_event(db, event) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="already_referred")
        result = create_referral(db, affiliate, event.owner_phones[0], "admin")
        if result == "self":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="self_referral")
        audit(db, user, "referral.attach", "event", event.id, label=event.title, meta={"code": affiliate.code})

    if "price" in fields and fields["price"] != (float(event.price) if event.price is not None else None):
        audit(
            db,
            user,
            "event.price",
            "event",
            event.id,
            label=event.title,
            changes={"price": [float(event.price) if event.price is not None else None, fields["price"]]},
        )
        event.price = fields["price"]
        if existing_pending := (
            db.query(models.AffiliateCommission)
            .filter(
                models.AffiliateCommission.event_id == event.id,
                models.AffiliateCommission.status == "pending",
            )
            .first()
        ):
            # Not decided yet: follows the corrected price.
            existing_pending.event_price = fields["price"]
            existing_pending.amount = round((fields["price"] or 0) * existing_pending.pct / 100, 2)

    skipped = None
    checks = None
    existing = (
        db.query(models.AffiliateCommission).filter(models.AffiliateCommission.event_id == event.id).first()
    )
    if fields.get("paid") is True and event.paid_at is None:
        if not event.price:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="price_required")
        event.paid_at = _now()
        audit(db, user, "event.mark_paid", "event", event.id, label=event.title, meta={"price": float(event.price)})
        if existing is None:
            db.flush()
            commission, checks, skipped = evaluate_commission(db, event, _referral_for_event(db, event))
            if commission is not None:
                db.add(commission)
                db.flush()
                audit(
                    db,
                    user,
                    "commission.create",
                    "affiliate_commission",
                    commission.id,
                    label=event.title,
                    meta={"amount": float(commission.amount), "pct": commission.pct},
                )
    elif fields.get("paid") is False and event.paid_at is not None:
        if existing is not None and existing.status == "paid":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="commission_paid")
        event.paid_at = None
        if existing is not None:
            db.delete(existing)
        audit(db, user, "event.mark_unpaid", "event", event.id, label=event.title)

    db.commit()
    db.refresh(event)
    return _payment_out(db, event, skipped, checks)
