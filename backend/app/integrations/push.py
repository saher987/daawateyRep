"""Real push notifications via Firebase Cloud Messaging — on top of, not
instead of, the existing in-app (polled) Notification model. A push only
ever reaches a device that has actually registered a token (see
POST /api/push-tokens) — i.e. someone who already has the app/site open
at least once and is signed in; a brand-new invitee with no account yet
still only gets the SMS/email link, same as before this existed.
"""

import logging

from firebase_admin import exceptions as firebase_exceptions
from firebase_admin import messaging
from sqlalchemy.orm import Session

# Triggers app.auth's module-level firebase_admin.initialize_app() if
# nothing else has yet — messaging.send_each_for_multicast() below needs a
# live default App, and this module has no other reason to import app.auth.
from app import auth as _auth  # noqa: F401
from app import models

logger = logging.getLogger(__name__)


def send_push_to_user(
    db: Session,
    user: models.User,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
) -> None:
    """Fire-and-forget: never raises. A push failing (no tokens registered,
    FCM unreachable, every token stale) must not break whatever request
    triggered it — inviting a guest still has to succeed even if the push
    to them doesn't."""
    tokens = [
        row.token
        for row in db.query(models.PushToken).filter(models.PushToken.user_id == user.id)
    ]
    if not tokens:
        logger.info("send_push_to_user: no tokens registered for user %s, skipping", user.id)
        return

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data=data or {},
        tokens=tokens,
    )
    try:
        response = messaging.send_each_for_multicast(message)
    except firebase_exceptions.FirebaseError:
        logger.exception("FCM send_each_for_multicast failed for user %s", user.id)
        return

    # No INFO-level confirmation of a successful call previously existed at
    # all, which made a silently-undelivered push indistinguishable from a
    # genuinely successful one when debugging after the fact — log FCM's own
    # per-token verdict (message id or the exact rejection reason) so a
    # "push never arrived" report can actually be diagnosed from logs alone.
    for token, result in zip(tokens, response.responses):
        if result.success:
            logger.info(
                "FCM accepted push for user %s (token %s...): message_id=%s",
                user.id,
                token[:12],
                result.message_id,
            )
        else:
            logger.warning(
                "FCM rejected push for user %s (token %s...): %s",
                user.id,
                token[:12],
                result.exception,
            )

    # Prune tokens FCM says are actually gone (app uninstalled, browser data
    # cleared, token rotated) — UnregisteredError specifically, not every
    # failure, since a transient error (network blip on FCM's end) doesn't
    # mean the token itself is bad.
    dead_tokens = [
        tokens[i]
        for i, result in enumerate(response.responses)
        if not result.success and isinstance(result.exception, messaging.UnregisteredError)
    ]
    if dead_tokens:
        db.query(models.PushToken).filter(models.PushToken.token.in_(dead_tokens)).delete(
            synchronize_session=False
        )
        db.commit()
