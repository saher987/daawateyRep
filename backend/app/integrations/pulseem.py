"""Pulseem SMS gateway — see BUSINESS_LOGIC.md / spec §6.

Endpoint, auth header, and sender number all match the original app
exactly. `PULSEEM_API_KEY` isn't set in any environment yet (Phase 6), so
`send_sms` degrades to a logged warning rather than failing — callers
(otp.py, and eventually the invitation-SMS flow) work fine without it,
they just don't actually deliver an SMS until the secret is wired up.
"""

import logging
import os

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_SEND_URL = "https://api.pulseem.com/api/v1/SmsApi/SendSms"
_SENDER_NUMBER = "0508085672"


def to_international_phone(phone: str) -> str:
    """Israeli local (05...) or already-international (972... / +972...)
    format, normalized to Pulseem's expected 972XXXXXXXXX — same rule the
    original's toIntlPhone used."""
    p = phone.strip().replace(" ", "")
    if p.startswith("+972"):
        return p[1:]
    if p.startswith("972"):
        return p
    if p.startswith("0"):
        return "972" + p[1:]
    return "972" + p


def find_by_phone(db: Session, model, phone: str, *extra_filters):
    """Match a row's phone column against `phone`, tolerating "05..." vs.
    "+972 5..." vs. "972..." formatting differences. Tries an exact-string
    match first (hits the column's index — cheap, and covers the common
    case since most numbers get typed the same way twice) before falling
    back to a full scan with normalization, which is O(rows) but only ever
    runs when the fast path misses. `extra_filters` are ANDed into both
    queries — e.g. excluding deactivated Users (see call sites)."""
    exact = db.query(model).filter(model.phone == phone, *extra_filters).first()
    if exact is not None:
        return exact
    normalized_phone = to_international_phone(phone)
    for candidate in db.query(model).filter(model.phone.isnot(None), *extra_filters):
        if to_international_phone(candidate.phone) == normalized_phone:
            return candidate
    return None


def send_sms(phone: str, text: str, reference: str) -> bool:
    """Returns whether the SMS was actually sent (vs. just logged because
    no API key is configured yet). Never raises — a failed/unsent SMS
    should not break the caller's request (same as the original, which
    logged the raw Pulseem response but didn't fail the request on it)."""
    api_key = os.environ.get("PULSEEM_API_KEY")
    if not api_key:
        logger.warning("PULSEEM_API_KEY not set — SMS to %s not sent: %s", phone, text)
        return False

    try:
        response = httpx.post(
            _SEND_URL,
            headers={"APIKey": api_key, "Content-Type": "application/json"},
            json={
                "SendId": f"daawatey-{reference}",
                "IsAsync": False,
                "SMSSendData": {
                    "FromNumber": _SENDER_NUMBER,
                    "ToNumberList": [to_international_phone(phone)],
                    "TextList": [text],
                    "ReferenceList": [reference],
                    "IsAutomaticUnsubscribeLink": False,
                },
            },
            timeout=10,
        )
        logger.info("Pulseem SMS response for %s: %s %s", reference, response.status_code, response.text)
        return response.is_success
    except httpx.HTTPError:
        logger.exception("Pulseem SMS request failed for %s", reference)
        return False
