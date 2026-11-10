"""Meta's WhatsApp webhook: delivery statuses for the messages
integrations/whatsapp.py sends (and any replies to the business number).

Configured in Meta's App Dashboard → WhatsApp → Configuration: Callback URL
<backend URL>/api/whatsapp/webhook, Verify token = WHATSAPP_WEBHOOK_VERIFY_TOKEN,
subscribed to the "messages" field. No user auth — Meta calls it; GET is
gated by the verify token, POST by the app-secret signature.
"""

import json
import logging
import os

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool

from app import db as app_db
from app.integrations.whatsapp import log_webhook_event, verify_webhook_signature
from app.routers.events import send_invitation_sms_fallback, send_reminder_sms_fallback, send_thanks_sms_fallback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["whatsapp"])


@router.get("/whatsapp/webhook", response_class=PlainTextResponse)
def verify_webhook(
    mode: str = Query("", alias="hub.mode"),
    verify_token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
) -> str:
    """The one-time handshake Meta does when the Callback URL is saved:
    echo hub.challenge back if the token matches ours."""
    expected = os.environ.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
    if mode == "subscribe" and expected and verify_token == expected:
        return challenge
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/whatsapp/webhook")
async def receive_webhook(request: Request) -> dict:
    body = await request.body()
    if not verify_webhook_signature(body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    try:
        failures = log_webhook_event(json.loads(body))
    except (ValueError, AttributeError, TypeError):
        # Still 200: a payload we can't read shouldn't make Meta retry it
        # (and eventually disable the webhook) — log it and move on.
        logger.exception("Unreadable WhatsApp webhook payload")
        failures = []
    # Undelivered invitations, reminders and thank-yous get the SMS instead.
    fallbacks = [f for f in failures if f["kind"] in _FALLBACKS]
    if fallbacks:
        await run_in_threadpool(_sms_fallbacks, fallbacks)
    return {"success": True}


# failure kind (whatsapp.py log_webhook_event) -> its SMS fallback
_FALLBACKS = {
    "invite": send_invitation_sms_fallback,
    "remind": send_reminder_sms_fallback,
    "thanks": send_thanks_sms_fallback,
}


def _sms_fallbacks(failures: list[dict]) -> None:
    """Blocking DB + SMS work, off the event loop. One failure's error never
    stops the others or the 200 Meta is waiting for."""
    if app_db.SessionLocal is None:
        logger.warning("No database configured — WhatsApp SMS fallback skipped")
        return
    db = app_db.SessionLocal()
    try:
        for f in failures:
            try:
                if _FALLBACKS[f["kind"]](db, f["recipient_id"], f["wamid"]):
                    logger.info("SMS fallback sent for undelivered WhatsApp %s %s", f["kind"], f["recipient_id"])
            except Exception:
                db.rollback()
                logger.exception("SMS fallback failed for %s", f["recipient_id"])
    finally:
        db.close()
