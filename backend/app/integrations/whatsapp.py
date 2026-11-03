"""WhatsApp Cloud API (Meta) — an alternative channel for invitations only.

Which channel an invitation's phone half goes out on is chosen by
INVITATION_CHANNEL (see `invitation_channel_for` below), and the same
setting picks the channel for thank-you messages (the `thanks` template);
OTP, reminders, and event-update notices all stay on Pulseem SMS
regardless.

Business-initiated WhatsApp messages must be pre-approved *templates* —
free text isn't allowed outside a 24h window the guest opened by writing
to us first, which an invitation never has. So instead of the SMS's text,
this sends one of these templates, picked by _whatsapp_invitation in
routers/events.py (variables in order):

  default:         guest name, inviter name, event title
                   حضرة {{1}}، تمت دعوتكم من {{2}} لحضور {{3}}. ...
  custom:          guest name, the event's WhatsApp (else SMS) text

  universal:       guest name, the event's WhatsApp invitation text
                   حضرة {{1}}، بكل محبة وتقدير،
                   {{2}}
                   لعرض تفاصيل الدعوة وتأكيد حضوركم ... بانتظار تشريفكم.
                   The default: used for every invitation, so changing
                   the wording needs a deploy instead of a new Meta
                   review. WHATSAPP_TEMPLATE_UNIVERSAL=off falls back to
                   the per-type templates above.

  thanks:          named variables {{event_name}}, {{event_owners}}, no
                   button — نتقدّم إليك بجزيل الشكر ... {{event_name}}.
                   ... {{event_owners}}. ...

Every invitation template also has a dynamic URL button, https://<domain>/i/{{1}} —
the guest's personal_token goes in as the button's one parameter. Each
template's name is overridable with its WHATSAPP_TEMPLATE_* env var.

Same degrade-gracefully pattern as pulseem.py: WHATSAPP_TOKEN or
WHATSAPP_PHONE_NUMBER_ID missing just logs a warning and returns False,
and nothing here ever raises.
"""

import hashlib
import hmac
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
            logger.info("%s not in WHATSAPP_TEST_PHONES — invitation goes by SMS", phone)
            return "sms"
    return channel


def _template_text(value: str) -> str:
    """Meta rejects template parameters containing newlines, tabs, or more
    than 4 consecutive spaces — a multi-line invitation_greeting gets
    flattened into one paragraph rather than failing the send."""
    return re.sub(r"\s+", " ", value).strip()


# template key -> (env var overriding its name, default name)
_TEMPLATES = {
    "default": ("WHATSAPP_TEMPLATE_DEFAULT", "daawatey_invitation"),
    "custom": ("WHATSAPP_TEMPLATE_CUSTOM", "daawatey_invitation_custom"),
    "universal": ("WHATSAPP_TEMPLATE_UNIVERSAL", "daawatey_invitation_universal"),
    "thanks": ("WHATSAPP_TEMPLATE_THANKS", "daawatey_thanks_ar"),
}


def universal_template_enabled() -> bool:
    """On unless WHATSAPP_TEMPLATE_UNIVERSAL is "off" — any other value is
    the template's name (default daawatey_invitation_universal)."""
    return os.environ.get("WHATSAPP_TEMPLATE_UNIVERSAL", "").strip().lower() != "off"


def send_whatsapp_template(
    phone: str,
    template_key: str,
    body_values: list[str] | dict[str, str],
    reference: str,
    personal_token: str | None = None,
) -> bool:
    """Sends one of _TEMPLATES. body_values is a list for templates with
    numbered variables ({{1}}, {{2}}, ...) or a dict for named ones
    ({{event_name}}); personal_token fills the invitation templates' URL
    button and is left out for templates without one (thanks).

    Returns whether Meta accepted the message. Accepted isn't delivered —
    a number with no WhatsApp account still comes back 200 here, its
    failure only reported later via webhook — so whatsapp_then_sms's SMS
    fallback only catches immediate errors (bad token, unapproved
    template, malformed number)."""
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    if not token or not phone_number_id:
        logger.warning(
            "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set — WhatsApp message to %s not sent", phone
        )
        return False

    env_var, default_name = _TEMPLATES[template_key]
    template = os.environ.get(env_var, "").strip() or default_name
    language = os.environ.get("WHATSAPP_TEMPLATE_LANG", "ar")
    api_version = os.environ.get("WHATSAPP_API_VERSION", "v23.0")
    if isinstance(body_values, dict):
        parameters = [
            {"type": "text", "parameter_name": name, "text": _template_text(v)} for name, v in body_values.items()
        ]
    else:
        parameters = [{"type": "text", "text": _template_text(v)} for v in body_values]
    components = [{"type": "body", "parameters": parameters}]
    if personal_token is not None:
        components.append(
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [{"type": "text", "text": personal_token}],
            }
        )

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
                    "components": components,
                },
            },
            timeout=10,
        )
        if not response.is_success:
            # A warning, not info: this is the line that says why a guest
            # got the SMS fallback instead (unapproved template, bad token...).
            logger.warning(
                "WhatsApp send failed for %s (%s): %s %s", reference, template, response.status_code, response.text
            )
            return False
        logger.info("WhatsApp response for %s (%s): %s %s", reference, template, response.status_code, response.text)
        return True
    except httpx.HTTPError:
        logger.exception("WhatsApp request failed for %s", reference)
        return False


# --- delivery-status webhook (routers/whatsapp_webhook.py) -------------------
#
# Meta's 200 on send only means "accepted"; whether the message was then
# delivered, read, or dropped (unapproved template, marketing limits, a
# number with no WhatsApp...) only ever arrives here. Each status is logged
# under this module's logger, so the same Cloud Logging query that shows a
# send ("app.integrations") shows what became of it.


def verify_webhook_signature(body: bytes, signature_header: str | None) -> bool:
    """Meta signs every webhook POST with the app secret (X-Hub-Signature-256:
    sha256=<hex HMAC of the raw body>). Without WHATSAPP_APP_SECRET nothing
    can be verified, so nothing is accepted."""
    app_secret = os.environ.get("WHATSAPP_APP_SECRET", "")
    if not app_secret:
        logger.warning("WHATSAPP_APP_SECRET not set — WhatsApp webhook POST rejected")
        return False
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.removeprefix("sha256="))


def log_webhook_event(payload: dict) -> None:
    """One log line per message status / incoming message in the payload.
    A failed status logs at WARNING with Meta's error code and details —
    the line that says why a guest never got the WhatsApp."""
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for st in value.get("statuses") or []:
                # biz_opaque_callback_data echoes back what send_whatsapp_template
                # set ("daawatey-<recipient id>"), tying the status to its guest.
                reference = st.get("biz_opaque_callback_data") or st.get("id")
                status = st.get("status")
                if status == "failed":
                    errors = "; ".join(
                        f"{e.get('code')} {e.get('title')}: {(e.get('error_data') or {}).get('details') or e.get('message')}"
                        for e in st.get("errors") or []
                    )
                    logger.warning(
                        "WhatsApp delivery failed for %s to %s: %s", reference, st.get("recipient_id"), errors
                    )
                else:
                    logger.info("WhatsApp status %s for %s to %s", status, reference, st.get("recipient_id"))
            for msg in value.get("messages") or []:
                # A guest replying to the business number. Only the type is
                # logged, not what they wrote.
                logger.info("WhatsApp incoming %s message from %s", msg.get("type"), msg.get("from"))
