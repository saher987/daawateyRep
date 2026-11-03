"""events gift settings — link-out cash gifts

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-03

gifts_enabled plus the host's Bit phone / PayBox link / bank details and
an optional note, shown to guests on their invitation. Guests pay outside
the app; nothing here records or moves money.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TEXT_COLUMNS = (
    ("gift_bit_phone", sa.String()),
    ("gift_paybox_url", sa.String()),
    ("gift_bank_details", sa.Text()),
    ("gift_note", sa.Text()),
)


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after these columns were added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("events")}
    if "gifts_enabled" not in existing_columns:
        op.add_column(
            "events",
            sa.Column("gifts_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    for name, type_ in _TEXT_COLUMNS:
        if name not in existing_columns:
            op.add_column("events", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_TEXT_COLUMNS):
        op.drop_column("events", name)
    op.drop_column("events", "gifts_enabled")
