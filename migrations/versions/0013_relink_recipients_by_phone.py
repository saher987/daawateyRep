"""data backfill: link unlinked invitation_recipients to their user by phone

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-07

Catch-up for a gap 0008 couldn't cover: otp.py's verify_otp linked only
*one* invitation per phone-OTP login (find_by_phone returns the first
row), so a guest invited to several events logged in with the others
left unlinked — shown as "لم يدخل التطبيق" in the guest list although
they have an account. verify_otp now links every invitation under the
phone; this links the rows that slipped through before the fix.

Only fills in a missing user_id (never re-points an existing link), and
only to an active account. Pure data migration, no schema change.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _to_international_phone(phone: str) -> str:
    # Inlined (same as 0007/0008) so this runs on sqlalchemy/alembic alone.
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

    user_by_normalized = {}
    for u in bind.execute(
        sa.text("SELECT id, phone FROM users WHERE is_active AND phone IS NOT NULL AND phone <> ''")
    ):
        user_by_normalized[_to_international_phone(u.phone)] = u.id

    linked = 0
    for r in list(
        bind.execute(
            sa.text(
                "SELECT id, phone FROM invitation_recipients "
                "WHERE user_id IS NULL AND phone IS NOT NULL AND phone <> ''"
            )
        )
    ):
        uid = user_by_normalized.get(_to_international_phone(r.phone))
        if uid is None:
            continue
        bind.execute(
            sa.text(
                "UPDATE invitation_recipients "
                "SET user_id = :uid, phone_verified = true, verified_phone = :phone "
                "WHERE id = :rid"
            ),
            {"uid": uid, "phone": r.phone, "rid": r.id},
        )
        linked += 1

    print(f"[0013] linked {linked} invitation_recipients row(s) to their matching user by phone")


def downgrade() -> None:
    # Only ever fills in missing links; nothing meaningful to undo.
    pass
