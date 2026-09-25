"""Guest phone verification (Flow G's guest-RSVP-with-OTP half; sendOtp /
verifyOtpAndLink in the original). No auth required — this is how an
unauthenticated guest proves they own a phone number before it gets linked
to their InvitationRecipient row.
"""

import os
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth as firebase_auth
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.integrations.pulseem import find_by_phone, send_sms, to_international_phone

router = APIRouter(prefix="/api", tags=["otp"])

# Both bound the same attack: an unauthenticated attacker who knows (or
# guesses) a phone number scripting /otp/verify to brute-force a 6-digit
# code without ever receiving the SMS. _MAX_VERIFY_ATTEMPTS caps how many
# wrong guesses one active code tolerates before it's locked out;
# _SEND_COOLDOWN caps how fast a fresh code (and fresh attempt budget) can
# be requested. Together: at most _MAX_VERIFY_ATTEMPTS guesses per
# _SEND_COOLDOWN seconds, versus unlimited guesses/second before this.
_MAX_VERIFY_ATTEMPTS = 5
_SEND_COOLDOWN = timedelta(seconds=60)


def _generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _link_recipient(recipient: models.InvitationRecipient, user: models.User) -> None:
    recipient.phone_verified = True
    recipient.verified_phone = recipient.phone
    recipient.user_id = user.id
    if not user.first_name and not user.last_name:
        if recipient.first_name:
            user.first_name = recipient.first_name
        if recipient.last_name:
            user.last_name = recipient.last_name


def link_pending_invitations(db: Session, user: models.User, phone: str) -> None:
    """Links every InvitationRecipient row already on file under `phone` to
    `user` — the same linking verify_otp does below on a phone-OTP login,
    but callable from anywhere else a phone number gets attached to an
    account after the fact (main.py's update_profile, for an Apple/Google/
    email account that signed up with no phone at all — 2026-09-24, see
    that call site's own comment for why this matters). Deliberately links
    *every* matching recipient, not just one: verify_otp's own opportunistic
    link only ever grabs a single row (find_by_phone's contract), which is
    fine there because /my-invitations' own read is already phone-tolerant
    regardless of whether user_id is set — but notify_event_update's
    push/in-app notification strictly requires it, so an invitee with two
    events under the same phone number needs both rows actually linked,
    not just whichever one happened to be found first."""
    normalized = to_international_phone(phone)
    linked_ids = set()
    for r in db.query(models.InvitationRecipient).filter(models.InvitationRecipient.phone == phone):
        linked_ids.add(r.id)
        _link_recipient(r, user)
    for r in db.query(models.InvitationRecipient).filter(models.InvitationRecipient.phone.isnot(None)):
        if r.id in linked_ids:
            continue
        if to_international_phone(r.phone) == normalized:
            _link_recipient(r, user)


@router.post("/otp/send", response_model=schemas.OtpSendResponse)
def send_otp(body: schemas.OtpSendRequest, db: Session = Depends(get_db)) -> schemas.OtpSendResponse:
    """sendOtp: 6-digit code, 10-minute expiry. Invalidates any of this
    phone's still-unused codes first, same as the original."""
    phone = body.phone.strip()

    last = (
        db.query(models.OtpVerification)
        .filter(models.OtpVerification.phone == phone)
        .order_by(models.OtpVerification.created_at.desc())
        .first()
    )
    if last is not None:
        now = datetime.now(timezone.utc)
        last_created = last.created_at
        if last_created.tzinfo is None:
            last_created = last_created.replace(tzinfo=timezone.utc)
        if now - last_created < _SEND_COOLDOWN:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting another code",
            )

    db.query(models.OtpVerification).filter(
        models.OtpVerification.phone == phone,
        models.OtpVerification.is_used.is_(False),
    ).update({"is_used": True})

    code = _generate_code()
    otp = models.OtpVerification(
        phone=phone,
        otp_code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(otp)
    db.commit()

    # The trailing "@domain #code" line is the WebOTP API's required
    # format (https://wicg.github.io/web-otp/) — Chrome on Android reads
    # it straight out of the SMS and offers a one-tap "verify" prompt
    # instead of the guest having to type the code in (see
    # PhoneOtpLogin.jsx's navigator.credentials.get call). Harmless
    # elsewhere: any client that doesn't recognize the format just shows
    # it as two extra lines of text.
    send_sms(
        phone,
        f"رمز التحقق الخاص بك في دعوتي: {code}\n\n@daawatey.com #{code}",
        reference=otp.id,
    )

    debug_echo = os.environ.get("OTP_DEBUG_ECHO") == "true"
    return schemas.OtpSendResponse(success=True, otp_preview=code if debug_echo else None)


@router.post("/otp/verify", response_model=schemas.OtpVerifyResponse)
def verify_otp(body: schemas.OtpVerifyRequest, db: Session = Depends(get_db)) -> schemas.OtpVerifyResponse:
    """verifyOtpAndLink, extended into a full phone login (2026-09 product
    decision: phone OTP as the primary way in, for both a guest opening an
    invitation and a brand-new user with no invitation yet — see
    BUSINESS_LOGIC.md). Validates the code exactly as before, then:

      1. Finds-or-creates the app account this phone number belongs to,
         and mints a Firebase custom token for it. The client signs in
         with that token — this is a real login, not just verification.
      2. Links (and pre-fills the account's name from) whatever
         InvitationRecipient this phone belongs to — either the specific
         one the caller names (`recipient_id`, from the invitation page)
         or, failing that, any recipient already on file under this phone
         (a brand-new phone-first signup with no invitation context yet
         still lands pre-linked to one waiting for them).

    Looked up by phone + unused only (not phone + code together, as before)
    so a wrong guess still finds the real pending code to count an attempt
    against — matching on the submitted code directly meant a wrong guess
    was indistinguishable from "no code exists", which is exactly what let
    unlimited guessing go unnoticed."""
    phone = body.phone.strip()
    otp = (
        db.query(models.OtpVerification)
        .filter(
            models.OtpVerification.phone == phone,
            models.OtpVerification.is_used.is_(False),
        )
        .order_by(models.OtpVerification.created_at.desc())
        .first()
    )
    if otp is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_otp")
    if otp.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="expired_otp")

    if otp.otp_code != body.otp_code:
        otp.attempts += 1
        if otp.attempts >= _MAX_VERIFY_ATTEMPTS:
            # Lock this code out rather than leaving it guessable until it
            # naturally expires — the caller has to request a fresh one,
            # which re-arms the send-side cooldown too.
            otp.is_used = True
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_otp")

    otp.is_used = True

    # Phone numbers get typed in different formats depending on who typed
    # them (a host inviting someone vs. the guest themselves) — compare
    # normalized (972XXXXXXXXX) so "05..." and "+972 5..." match the same
    # underlying number, without changing what's actually stored anywhere.
    normalized_phone = to_international_phone(phone)

    # Only trust a caller-supplied recipient_id if that recipient's own
    # phone actually matches what was just OTP-verified — otherwise
    # anyone could verify their own phone and pass someone else's
    # recipient_id to get that person's invitation linked (and thus
    # visible under /my-invitations) to their own account.
    recipient = None
    if body.recipient_id:
        candidate = db.get(models.InvitationRecipient, body.recipient_id)
        if (
            candidate is not None
            and candidate.phone
            and to_international_phone(candidate.phone) == normalized_phone
        ):
            recipient = candidate

    # No (valid) recipient_id given — a phone-first Login/Register signup
    # with no invitation context in hand. Opportunistically link any
    # recipient already invited under this phone anyway.
    if recipient is None:
        recipient = find_by_phone(db, models.InvitationRecipient, phone)

    # Reuse the existing account if one is already registered under this
    # phone number (e.g. a Google/Apple account the guest later added a
    # matching phone to in Profile) — mint the token for *that* Firebase
    # uid so this is the same account logging in a second way, not a new,
    # disconnected one. is_active=True excludes deactivated duplicates —
    # phone isn't unique on users, so two accounts sharing a number (one
    # admin-disabled after the fact) is a real scenario, and matching the
    # disabled one would sign in fine but then 403 "Account disabled" on
    # the very next call (get_app_user), which looks like a silent failure
    # from the client's side rather than a clear error.
    existing_user = find_by_phone(db, models.User, phone, models.User.is_active.is_(True))

    is_new_user = existing_user is None
    if existing_user is not None:
        user = existing_user
        uid = user.firebase_uid
    else:
        # Deterministic per-number uid: a second OTP login from the same
        # phone (no Google/Apple account ever added) reuses this same row
        # instead of creating another one.
        uid = f"phone:{normalized_phone}"
        user = db.query(models.User).filter_by(firebase_uid=uid).one_or_none()
        if user is not None:
            is_new_user = False
        else:
            try:
                user = models.User(
                    firebase_uid=uid,
                    # users.email is NOT NULL + unique; phone-only accounts
                    # get the same never-colliding placeholder app.auth's
                    # lazy User-creation already uses for this exact case.
                    email=f"{uid}@no-email.invalid",
                    phone=phone,
                )
                db.add(user)
                # id has a Python-side default (_uuid), which SQLAlchemy
                # only evaluates on flush — read below via
                # recipient.user_id, so without this explicit flush that
                # assignment would silently write None instead of the
                # real id.
                db.flush()
            except IntegrityError:
                # users.phone is unique (migrations/versions/0005). Two
                # causes land here: another concurrent request for this
                # same brand-new phone already won (the query above just
                # hadn't seen it yet), or a stale inactive duplicate
                # predating users.py's deactivate-time phone-clearing is
                # still squatting on this exact string. Resolve whichever
                # it is instead of crashing.
                db.rollback()
                # rollback() expires every object in the session, including
                # `otp` — its is_used=True from above never got committed,
                # so it needs reasserting or the code goes right back to
                # being guessable/reusable after this request.
                otp.is_used = True
                user = db.query(models.User).filter_by(firebase_uid=uid).one_or_none()
                if user is not None:
                    is_new_user = False
                else:
                    stale = db.query(models.User).filter(models.User.phone == phone).one_or_none()
                    if stale is not None and not stale.is_active:
                        stale.phone = None
                        db.flush()
                    user = models.User(
                        firebase_uid=uid,
                        email=f"{uid}@no-email.invalid",
                        phone=phone,
                    )
                    db.add(user)
                    db.flush()

    if recipient is not None:
        recipient.phone_verified = True
        recipient.verified_phone = phone
        recipient.user_id = user.id
        if not user.first_name and not user.last_name:
            if recipient.first_name:
                user.first_name = recipient.first_name
            if recipient.last_name:
                user.last_name = recipient.last_name

    db.commit()

    # create_custom_token needs no prior Firebase-side user for this uid —
    # it's a pure JWT the client redeems via signInWithCustomToken, which
    # creates the underlying Firebase Auth user lazily on first use if one
    # doesn't already exist.
    custom_token = firebase_auth.create_custom_token(uid).decode("utf-8")

    return schemas.OtpVerifyResponse(success=True, is_new_user=is_new_user, custom_token=custom_token)
