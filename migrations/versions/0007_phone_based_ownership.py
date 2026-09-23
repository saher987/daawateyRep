"""events.owner_phones/manager_phones, venues.owner_phones — phone-based ownership

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-23

Phone, not email: replaces owner_email/owner_emails/manager_emails
(Event) and owner_emails (Venue), which stopped being a reliable
identity the moment phone-OTP became the primary login (those accounts
carry a synthetic placeholder email, never a real one an admin would
have typed when granting ownership — see models.py's own
phone-uniqueness comment on User). Backfills the new columns from the
old ones by matching each stored email to a user account and taking
that account's phone.

The old email columns are deliberately left in place (unused by any
app code from here on) rather than dropped in this same migration — a
one-release safety net in case the backfill missed someone (e.g. an
owner who was never actually a signed-in account, or one without a
phone on file), not a design to keep long-term.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _to_international_phone(phone: str) -> str:
    # Inlined rather than imported from app.integrations.pulseem: keeps
    # this migration runnable on nothing but sqlalchemy/alembic, the same
    # as every other migration here, rather than depending on the rest of
    # the app's own import graph (httpx, firebase_admin, ...) resolving
    # cleanly in whatever environment runs `alembic upgrade`.
    p = phone.strip().replace(" ", "")
    if p.startswith("+972"):
        return p[1:]
    if p.startswith("972"):
        return p
    if p.startswith("0"):
        return "972" + p[1:]
    return "972" + p


def _backfill_phones(bind, table: str, email_columns: list[str], email_to_phone: dict[str, str]) -> None:
    phone_columns = [c.replace("email", "phone") for c in email_columns]
    select_cols = ", ".join(["id", *email_columns])
    for row in bind.execute(sa.text(f"SELECT {select_cols} FROM {table}")):
        update_values = {"id": row.id}
        set_clauses = []
        for email_col, phone_col in zip(email_columns, phone_columns):
            emails = getattr(row, email_col) or []
            phones = sorted({
                _to_international_phone(email_to_phone[e]) for e in emails if e in email_to_phone
            })
            update_values[phone_col] = phones
            set_clauses.append(f"{phone_col} = :{phone_col}")
        bind.execute(
            sa.text(f"UPDATE {table} SET {', '.join(set_clauses)} WHERE id = :id"),
            update_values,
        )


def upgrade() -> None:
    # Guarded like every migration since 0002: 0001 is a "living" migration
    # that creates these columns straight from app/models.py's *current*
    # shape (owner_phones/manager_phones, no owner_emails/manager_emails
    # at all) on any database bootstrapped from scratch after this change —
    # add_column would DuplicateColumn on those, and there'd be no old
    # email columns to backfill from anyway.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    event_columns = {c["name"] for c in inspector.get_columns("events")}
    venue_columns = {c["name"] for c in inspector.get_columns("venues")}

    if "owner_phones" not in event_columns:
        op.add_column(
            "events",
            sa.Column("owner_phones", sa.ARRAY(sa.String()), nullable=False, server_default="{}"),
        )
        op.add_column(
            "events",
            sa.Column("manager_phones", sa.ARRAY(sa.String()), nullable=False, server_default="{}"),
        )
        email_to_phone = {
            row.email: row.phone
            for row in bind.execute(sa.text("SELECT email, phone FROM users WHERE phone IS NOT NULL"))
        }
        _backfill_phones(bind, "events", ["owner_emails", "manager_emails"], email_to_phone)

    if "owner_phones" not in venue_columns:
        op.add_column(
            "venues",
            sa.Column("owner_phones", sa.ARRAY(sa.String()), nullable=False, server_default="{}"),
        )
        email_to_phone = {
            row.email: row.phone
            for row in bind.execute(sa.text("SELECT email, phone FROM users WHERE phone IS NOT NULL"))
        }
        _backfill_phones(bind, "venues", ["owner_emails"], email_to_phone)


def downgrade() -> None:
    op.drop_column("events", "owner_phones")
    op.drop_column("events", "manager_phones")
    op.drop_column("venues", "owner_phones")
