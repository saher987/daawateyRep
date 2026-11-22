"""TEST_RECIPIENTS: the one switch that makes it safe to give staging the
same Pulseem/Resend/WhatsApp keys prod has (DEPLOYMENT.md, "Staging").

Staging shares prod's code and, once its keys are mounted, can really send,
but its database is full of test events whose guests may carry real
people's numbers (copied in while testing). When TEST_RECIPIENTS is set
(comma-separated phones and/or emails, any phone format), send_sms,
send_whatsapp_template and send_email only reach those; everyone else is
logged and skipped, exactly like a missing API key. Unset (prod) means no
restriction. deploy.yml refuses to mount staging's keys without it.
"""

import logging
import os

from app.integrations.pulseem import to_international_phone

logger = logging.getLogger(__name__)


def _allowlist() -> tuple[set[str], set[str]] | None:
    raw = os.environ.get("TEST_RECIPIENTS", "").strip()
    if not raw:
        return None
    phones, emails = set(), set()
    for item in (p.strip() for p in raw.split(",")):
        if not item:
            continue
        if "@" in item:
            emails.add(item.lower())
        else:
            phones.add(to_international_phone(item))
    return phones, emails


def phone_blocked(phone: str, channel: str) -> bool:
    allow = _allowlist()
    if allow is None or to_international_phone(phone) in allow[0]:
        return False
    logger.warning("%s not in TEST_RECIPIENTS — %s not sent", phone, channel)
    return True


def email_blocked(email: str) -> bool:
    allow = _allowlist()
    if allow is None or (email or "").strip().lower() in allow[1]:
        return False
    logger.warning("%s not in TEST_RECIPIENTS — email not sent", email)
    return True
