"""events.thank_you_message — per-event thank-you template

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-09

The event owner writes the thank-you text by hand, with placeholders like
[first_name] / [nick_name] that the frontend fills per invitee (see
frontend/src/lib/thankYouMessage.js) before opening WhatsApp for guests
who accepted.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0004: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("events")}
    if "thank_you_message" not in existing_columns:
        op.add_column("events", sa.Column("thank_you_message", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "thank_you_message")
