"""data backfill: link existing invitation_recipients to matching users by phone

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-25

One-time catch-up for accounts that fell into a real gap before
app/routers/otp.py's link_pending_invitations existed (added the same
day as this migration): an account that signed in via Apple/Google/
email (no phone at signup, once phone stopped being mandatory for Apple
App Review guideline 5.1.1 — see migrations/versions/0007's own era of
changes) and then added a matching phone number afterward in Profile
never got invitation_recipients.user_id backfilled for whatever
invitation(s) were already sitting under that phone number, because
nothing triggered that link before update_profile started calling it.
New profile-phone-saves link correctly from here on; this migration
catches whoever already made that save before the fix shipped.

Pure data migration, no schema change — only ever fills in a missing
link or corrects a stale one to today's phone-is-ground-truth rule,
never removes anything. Prints how many rows it touched so the actual
scope is visible in the migration's own output, not just assumed.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _to_international_phone(phone: str) -> str:
    # Inlined rather than imported from app.integrations.pulseem — same
    # reasoning as 0007's own copy: keeps this migration runnable on
    # nothing but sqlalchemy/alembic.
    p = phone.strip().replace(" ", "")
    if p.startswith("+972"):
        return p[1:]
    if p.startswith("972"):
        return p
    if p.startswith("0"):
        return "972" + p[1:]
    return "972" + p


def upgrade() -> None:
    bind = op.get_bind()

    users = list(
        bind.execute(sa.text("SELECT id, phone, first_name, last_name FROM users WHERE phone IS NOT NULL AND phone <> ''"))
    )
    user_by_normalized = {}
    for u in users:
        try:
            user_by_normalized[_to_international_phone(u.phone)] = u
        except Exception:
            continue

    recipients = list(
        bind.execute(
            sa.text(
                "SELECT id, phone, user_id, first_name, last_name FROM invitation_recipients "
                "WHERE phone IS NOT NULL AND phone <> ''"
            )
        )
    )

    linked = 0
    for r in recipients:
        try:
            norm = _to_international_phone(r.phone)
        except Exception:
            continue
        u = user_by_normalized.get(norm)
        if u is None or r.user_id == u.id:
            continue  # no matching account, or already correctly linked

        bind.execute(
            sa.text(
                "UPDATE invitation_recipients "
                "SET user_id = :uid, phone_verified = true, verified_phone = :phone "
                "WHERE id = :rid"
            ),
            {"uid": u.id, "phone": r.phone, "rid": r.id},
        )

        # Opportunistic name backfill onto the account, same rule as
        # otp.py's _link_recipient: only if it has no name at all yet.
        if not u.first_name and not u.last_name and (r.first_name or r.last_name):
            bind.execute(
                sa.text("UPDATE users SET first_name = :f, last_name = :l WHERE id = :uid"),
                {"f": r.first_name or u.first_name, "l": r.last_name or u.last_name, "uid": u.id},
            )

        linked += 1

    print(f"[0008] linked {linked} invitation_recipients row(s) to their matching user by phone")


def downgrade() -> None:
    # Not meaningfully reversible — this only ever fills in a missing
    # link or corrects a stale one, never removes information. No-op.
    pass
