"""WhatsApp Cloud API (Meta) — an alternative channel for invitations only.

Which channel an invitation's phone half goes out on is chosen by
INVITATION_CHANNEL (see `invitation_channel_for` below); OTP, thank-you
messages, reminders, and event-update notices all stay on Pulseem SMS
regardless.

Business-initiated WhatsApp messages must be pre-approved *templates* —
free text isn't allowed outside a 24h window the guest opened by writing
to us first, which an invitation never has. So instead of the SMS's text,
this sends one of two templates mirroring the SMS's two variants
(_send_invitation in routers/events.py):

  WHATSAPP_TEMPLATE_DEFAULT (no custom greeting on the event)
      body:   حضرة {{1}}، تمت دعوتكم من {{2}} لحضور {{3}}. ...
  WHATSAPP_TEMPLATE_CUSTOM (event.invitation_greeting set)
      body:   حضرة {{1}}، {{2}} ...
  both:   a dynamic URL button, https://<domain>/i/{{1}} — the
          guest's personal_token goes in as the button's one parameter

Same degrade-gracefully pattern as pulseem.py: WHATSAPP_TOKEN or
WHATSAPP_PHONE_NUMBER_ID missing just logs a warning and returns False,
and nothing here ever raises.
"""

import logging
import os
import re

import httpx

from app.integrations.pulseem import to_international_phone

logger = logging.getLogger(__name__)

_CHANNELS = ("sms", "whatsapp", "whatsapp_then_sms")


def invitation_channel_for(phone: str) -> str:
    """INVITATION_CHANNEL, falling back to "sms" when unset or unrecognized
    — so a typo can never silently stop invitations from going out the
    way they always have. WHATSAPP_TEST_PHONES (comma-separated, any phone
    format) narrows WhatsApp to just those numbers, everyone else staying
    on SMS — for trying it on real phones in prod without touching real
    guests."""
    channel = os.environ.get("INVITATION_CHANNEL", "sms").strip().lower()
    if channel not in _CHANNELS:
        logger.warning("Unknown INVITATION_CHANNEL %r — falling back to sms", channel)
        return "sms"
    test_phones = os.environ.get("WHATSAPP_TEST_PHONES", "").strip()
    if channel != "sms" and test_phones:
        allowed = {to_international_phone(p) for p in test_phones.split(",") if p.strip()}
        if to_international_phone(phone) not in allowed:
            return "sms"
    return channel


def _template_text(value: str) -> str:
    """Meta rejects template parameters containing newlines, tabs, or more
    than 4 consecutive spaces — a multi-line invitation_greeting gets
    flattened into one paragraph rather than failing the send."""
    return re.sub(r"\s+", " ", value).strip()


def send_whatsapp_invitation(
    phone: str,
    invitee_name: str,
    personal_token: str,
    reference: str,
    greeting: str | None = None,
    invitor_name: str = "",
    event_title: str = "",
) -> bool:
    """Returns whether Meta accepted the message. Accepted isn't delivered —
    a number with no WhatsApp account still comes back 200 here, its
    failure only reported later via webhook — so whatsapp_then_sms's SMS
    fallback only catches immediate errors (bad token, unapproved
    template, malformed number)."""
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    if not token or not phone_number_id:
        logger.warning(
            "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set — WhatsApp invitation to %s not sent", phone
        )
        return False

    if greeting:
        template = os.environ.get("WHATSAPP_TEMPLATE_CUSTOM", "daawatey_invitation_custom")
        body_values = [invitee_name, greeting]
    else:
        template = os.environ.get("WHATSAPP_TEMPLATE_DEFAULT", "daawatey_invitation")
        body_values = [invitee_name, invitor_name, event_title]
    language = os.environ.get("WHATSAPP_TEMPLATE_LANG", "ar")
    api_version = os.environ.get("WHATSAPP_API_VERSION", "v23.0")

    try:
        response = httpx.post(
            f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "to": to_international_phone(phone),
                "type": "template",
                "biz_opaque_callback_data": f"daawatey-{reference}",
                "template": {
                    "name": template,
                    "language": {"code": language},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [{"type": "text", "text": _template_text(v)} for v in body_values],
                        },
                        {
                            "type": "button",
                            "sub_type": "url",
                            "index": "0",
                            "parameters": [{"type": "text", "text": personal_token}],
                        },
                    ],
                },
            },
            timeout=10,
        )
        logger.info("WhatsApp response for %s: %s %s", reference, response.status_code, response.text)
        return response.is_success
    except httpx.HTTPError:
        logger.exception("WhatsApp request failed for %s", reference)
        return False
