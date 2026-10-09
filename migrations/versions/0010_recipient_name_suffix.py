"""invitation_recipients.name_suffix — [suffix] for thank-you messages

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-09

Per-guest text like "وعائلته" or "وزوجته" that fills the [suffix]
placeholder in events.thank_you_message (see 0009).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0004: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("invitation_recipients")}
    if "name_suffix" not in existing_columns:
        op.add_column("invitation_recipients", sa.Column("name_suffix", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("invitation_recipients", "name_suffix")
