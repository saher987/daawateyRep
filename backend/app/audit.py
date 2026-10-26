"""Audit log: who did what, from the app.

Two layers, on purpose:

- audit(): the real audit log. Endpoints call it for the actions worth
  recording (user deactivated, event activated, reminders sent, provider
  approved, ...), and it adds an AuditLog row to the endpoint's own session
  — committed together with the action itself, so a row exists exactly
  when the action went through. This is what admins read in the app
  (GET /api/audit-log).
- RequestLogMiddleware: the safety net. One structured JSON line per
  POST/PUT/PATCH/DELETE request goes to stdout, which Cloud Run ships to
  Cloud Logging — so an endpoint nobody added an audit() call to, or a
  failed attempt (a 403, a 500), still leaves a trace. Nothing is written
  to the database here.

Both carry the same request_id, so an audit row can be matched to its
request's log line (and vice versa).
"""

import json
import logging
import os
import sys
import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from app import models

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def environment() -> str:
    """"prod" / "staging" from the GCP project the service runs in, "local"
    otherwise. Stored on every row because staging shares prod's database
    (ARCHITECTURE.md) — without it, staging test actions would read as real
    ones."""
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
    if not project:
        return "local"
    return project.removeprefix("daawatey-")


@dataclass
class RequestContext:
    """Per-request details the middleware knows up front (ip, user agent,
    ...) plus the signed-in user, which only get_app_user knows — it fills
    the actor in on this same object, so the middleware's log line can name
    who made the request. Plain values, not the User itself: by the time
    the line is logged the request's session is closed."""

    request_id: str
    ip: str | None
    user_agent: str | None
    platform: str | None
    trace: str | None
    actor_id: str | None = None
    actor_role: str | None = None


_request_context: ContextVar[RequestContext | None] = ContextVar("audit_request_context", default=None)


def set_actor(user: models.User) -> None:
    ctx = _request_context.get()
    if ctx is not None:
        ctx.actor_id = user.id
        ctx.actor_role = user.role.value


def _json_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_json_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _json_value(v) for k, v in value.items()}
    return value


def snapshot(obj: Any, fields: Any) -> dict[str, Any]:
    """The current values of `fields` on `obj` — taken before an edit, then
    handed to changes_since() after it."""
    return {f: _json_value(getattr(obj, f)) for f in fields}


def changes_since(before: dict[str, Any], obj: Any) -> dict[str, list[Any]]:
    """{field: [old, new]} for every field in `before` whose value differs
    now. Fields an edit sent but didn't actually change are left out."""
    changes = {}
    for field, old in before.items():
        new = _json_value(getattr(obj, field))
        if new != old:
            changes[field] = [old, new]
    return changes


def display_name(user: models.User) -> str:
    return " ".join(p for p in (user.first_name, user.last_name) if p) or user.phone or user.email


def audit(
    db: Session,
    actor: models.User | None,
    action: str,
    entity_type: str,
    entity_id: str | None,
    *,
    label: str | None = None,
    changes: dict | None = None,
    meta: dict | None = None,
) -> None:
    """Records one action. Doesn't commit — call it before the endpoint's own
    db.commit(), so the row and the change it describes are saved (or
    rolled back) together.

    `action` is "<entity>.<verb>" (event.activate, user.deactivate, ...).
    Never put OTP codes, tokens or guests' phone numbers in `changes`/
    `meta` — admins read these rows as-is."""
    ctx = _request_context.get()
    db.add(
        models.AuditLog(
            created_at=datetime.now(timezone.utc),
            environment=environment(),
            actor_user_id=actor.id if actor else None,
            actor_role=actor.role.value if actor else None,
            actor_name=display_name(actor) if actor else None,
            actor_phone=actor.phone if actor else None,
            actor_email=actor.email if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=label,
            changes=_json_value(changes) or None,
            meta=_json_value(meta) or None,
            platform=ctx.platform if ctx else None,
            ip=ctx.ip if ctx else None,
            user_agent=ctx.user_agent if ctx else None,
            request_id=ctx.request_id if ctx else None,
        )
    )


# --- request log (Cloud Logging) ---------------------------------------------

# Its own handler, straight to stdout as one JSON object per line: Cloud Run
# parses that into a structured entry (jsonPayload, severity, trace), and it
# doesn't depend on how uvicorn configured the root logger.
_request_logger = logging.getLogger("daawatey.requests")
_request_logger.setLevel(logging.INFO)
_request_logger.propagate = False
if not _request_logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _request_logger.addHandler(_handler)


def _header(scope: dict, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


class RequestLogMiddleware:
    """Plain ASGI middleware (not BaseHTTPMiddleware): sets up the request's
    RequestContext for audit() and get_app_user, and logs every mutating
    request's outcome — including the ones that raise."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Cloud Run sends "TRACE_ID/SPAN_ID;o=1" — reusing the trace id groups
        # this line with Cloud Run's own request log entry.
        trace_header = _header(scope, b"x-cloud-trace-context")
        trace_id = trace_header.split("/", 1)[0] if trace_header else None
        forwarded = _header(scope, b"x-forwarded-for")
        client = scope.get("client")
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        ctx = RequestContext(
            request_id=trace_id or uuid.uuid4().hex,
            ip=forwarded.split(",")[0].strip() if forwarded else (client[0] if client else None),
            user_agent=(_header(scope, b"user-agent") or "")[:500] or None,
            platform=(_header(scope, b"x-client-platform") or "")[:20] or None,
            trace=f"projects/{project}/traces/{trace_id}" if trace_id and project else None,
        )
        token = _request_context.set(ctx)

        status_code = 500
        started = time.monotonic()

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _request_context.reset(token)
            if scope["method"] in _MUTATING_METHODS:
                self._log(scope, ctx, status_code, time.monotonic() - started)

    @staticmethod
    def _log(scope: dict, ctx: RequestContext, status_code: int, elapsed: float) -> None:
        entry = {
            "severity": "WARNING" if status_code >= 400 else "INFO",
            "message": f"{scope['method']} {scope['path']} {status_code}",
            "audit": True,
            "environment": environment(),
            "method": scope["method"],
            "path": scope["path"],
            "status": status_code,
            "ms": round(elapsed * 1000),
            "user_id": ctx.actor_id,
            "role": ctx.actor_role,
            "platform": ctx.platform,
            "ip": ctx.ip,
            "request_id": ctx.request_id,
        }
        if ctx.trace:
            entry["logging.googleapis.com/trace"] = ctx.trace
        _request_logger.info(json.dumps(entry, ensure_ascii=False))
