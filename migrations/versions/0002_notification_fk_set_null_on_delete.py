"""notifications.event_id / recipient_id: ON DELETE SET NULL

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-13

A notification is a standalone record of something that already happened
("you were invited to X") — it must not block deleting the event or
invitation_recipient it points to. Before this migration, deleting an
invitee via DELETE /api/invitation-recipients/{id} (added alongside the new
in-app notifications feature, which now creates a notification row on every
new invite) failed with a ForeignKeyViolation the moment that invitee had
ever been notified. Both FKs get the same treatment for consistency, even
though only the recipient one has been hit in practice so far.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "notifications_event_id_fkey", "notifications", type_="foreignkey"
    )
    op.create_foreign_key(
        "notifications_event_id_fkey",
        "notifications",
        "events",
        ["event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_constraint(
        "notifications_recipient_id_fkey", "notifications", type_="foreignkey"
    )
    op.create_foreign_key(
        "notifications_recipient_id_fkey",
        "notifications",
        "invitation_recipients",
        ["recipient_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "notifications_recipient_id_fkey", "notifications", type_="foreignkey"
    )
    op.create_foreign_key(
        "notifications_recipient_id_fkey",
        "notifications",
        "invitation_recipients",
        ["recipient_id"],
        ["id"],
    )
    op.drop_constraint(
        "notifications_event_id_fkey", "notifications", type_="foreignkey"
    )
    op.create_foreign_key(
        "notifications_event_id_fkey",
        "notifications",
        "events",
        ["event_id"],
        ["id"],
    )
