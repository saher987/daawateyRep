"""Guest phone verification (Flow G's guest-RSVP-with-OTP half; sendOtp /
verifyOtpAndLink in the original). No auth required — this is how an
unauthenticated guest proves they own a phone number before it gets linked
to their InvitationRecipient row.
"""

import os
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.integrations.pulseem import send_sms

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

    send_sms(phone, f"رمز التحقق الخاص بك في دعوتي: {code}", reference=otp.id)

    debug_echo = os.environ.get("OTP_DEBUG_ECHO") == "true"
    return schemas.OtpSendResponse(success=True, otp_preview=code if debug_echo else None)


@router.post("/otp/verify", response_model=schemas.OtpVerifyResponse)
def verify_otp(body: schemas.OtpVerifyRequest, db: Session = Depends(get_db)) -> schemas.OtpVerifyResponse:
    """verifyOtpAndLink: validate the code, mark it used, link the verified
    phone (and, if an account with that phone already exists, the user_id)
    to the InvitationRecipient.

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

    recipient = db.get(models.InvitationRecipient, body.recipient_id)
    if recipient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invitation not found")

    existing_user = db.query(models.User).filter(models.User.phone == phone).first()
    recipient.phone_verified = True
    recipient.verified_phone = phone
    if existing_user is not None:
        recipient.user_id = existing_user.id

    db.commit()
    return schemas.OtpVerifyResponse(success=True, is_new_user=existing_user is None)
