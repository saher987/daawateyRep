"""Support.jsx's contact form (sendSupportEmail in the original). No auth
required — the same as /terms, /privacy, /support themselves: a visitor
who isn't signed in yet can still reach this page and ask a question."""

import os

from fastapi import APIRouter

from app import schemas
from app.integrations.resend_email import send_email

router = APIRouter(prefix="/api", tags=["support"])


@router.post("/support-messages", status_code=202)
def send_support_message(body: schemas.SupportMessageCreate) -> dict:
    """Emails the submitted form to SUPPORT_TO_EMAIL via Resend, with the
    visitor set as Reply-To so a reply goes straight to them. Degrades the
    same way pulseem.py/resend_email.py do everywhere else — a missing
    RESEND_API_KEY just logs and returns success:false, it never 500s on
    the visitor. Always 202 regardless: the message was accepted, whether
    or not delivery actually happened is an operational concern, not the
    caller's."""
    to = os.environ.get("SUPPORT_TO_EMAIL", "support@daawatey.com")
    html = (
        f"<p><strong>From:</strong> {body.name} ({body.email})</p>"
        f"<p><strong>Subject:</strong> {body.subject}</p>"
        f"<p>{body.message}</p>"
    )
    sent = send_email(to, f"[Support] {body.subject}", html, reply_to=body.email)
    return {"success": sent}
