"""imported_invitees

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-13

Rows saved on an event's import page until their invitation is sent
(imported_invitees.py, ImportInvitees.jsx). Its own table so nothing that
reads invitation_recipients ever sees someone who wasn't invited yet.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0030: 0001 creates tables straight from app/models.py on
    # any database bootstrapped after this table was added there.
    bind = op.get_bind()
    if "imported_invitees" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "imported_invitees",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("event_id", sa.String(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nickname", sa.String(), nullable=True),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("name_suffix", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("town", sa.String(), nullable=True),
        sa.Column("town_text", sa.String(), nullable=True),
        sa.Column("side_text", sa.String(), nullable=True),
        sa.Column("guests_count", sa.Integer(), nullable=False, server_default="1"),
        # The enum exists since 0030 (invitation_recipients.side).
        sa.Column("side", postgresql.ENUM(name="recipient_side", create_type=False), nullable=True),
        sa.Column("group_label", sa.String(), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_imported_invitees_event_id", "imported_invitees", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_imported_invitees_event_id", table_name="imported_invitees")
    op.drop_table("imported_invitees")
