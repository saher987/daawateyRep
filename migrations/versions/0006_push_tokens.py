"""push_tokens — FCM device registration tokens for real push notifications

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-19

Backs app/integrations/push.py: one row per signed-in device (web browser
or the native app), used to actually send a push via Firebase Cloud
Messaging when a guest is invited (see events.py's recipient-creation
endpoint) — on top of the existing in-app (polled) Notification, not
replacing it.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like every migration since 0002: 0001 is a "living" migration
    # that creates this table straight from app/models.py on any database
    # bootstrapped from scratch after PushToken was added there —
    # create_table would DuplicateTable on those.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "push_tokens" in inspector.get_table_names():
        return

    op.create_table(
        "push_tokens",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(), nullable=False, unique=True),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("push_tokens")
