"""Resend email — see BUSINESS_LOGIC.md / spec §6.

Same degrade-gracefully pattern as pulseem.py: RESEND_API_KEY missing just
logs a warning and skips sending rather than failing the request that
triggered it (adding a recipient should never fail just because an email
couldn't go out).
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_SEND_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — email to %s not sent: %s", to, subject)
        return False

    from_address = os.environ.get("RESEND_FROM_EMAIL", "Daawatey <noreply@daawatey.com>")
    try:
        response = httpx.post(
            _SEND_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": from_address, "to": to, "subject": subject, "html": html},
            timeout=10,
        )
        logger.info("Resend response for %s: %s %s", to, response.status_code, response.text)
        return response.is_success
    except httpx.HTTPError:
        logger.exception("Resend email request failed for %s", to)
        return False
