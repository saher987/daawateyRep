"""event reminders: per-event reminder texts, per-guest reminder count

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-20

events.reminder_message / reminder_message_pending: the reminder texts
(for guests who accepted / who haven't replied), saved from the reminder
dialog. invitation_recipients.reminder_count / last_reminded_at: how many
reminders actually went out to a guest, and when the last one did.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {col["name"] for col in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after these were added there.
    events = _columns("events")
    if "reminder_message" not in events:
        op.add_column("events", sa.Column("reminder_message", sa.Text(), nullable=True))
    if "reminder_message_pending" not in events:
        op.add_column("events", sa.Column("reminder_message_pending", sa.Text(), nullable=True))
    recipients = _columns("invitation_recipients")
    if "reminder_count" not in recipients:
        op.add_column(
            "invitation_recipients",
            sa.Column("reminder_count", sa.Integer(), nullable=False, server_default="0"),
        )
    if "last_reminded_at" not in recipients:
        op.add_column(
            "invitation_recipients",
            sa.Column("last_reminded_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("invitation_recipients", "last_reminded_at")
    op.drop_column("invitation_recipients", "reminder_count")
    op.drop_column("events", "reminder_message_pending")
    op.drop_column("events", "reminder_message")
