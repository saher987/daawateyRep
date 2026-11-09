"""invitation_recipients.thanked_at

Revision ID: 0028
Revises: 0027
Create Date: 2026-11-09

When the last thank-you to a guest actually went out. The bulk thank-you
(BulkThankYouDialog.jsx) skips guests who were already thanked, so
sending twice doesn't message everyone again. Set by events.py's
_send_thanks_to. Existing guests start as never thanked.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("invitation_recipients")}
    if "thanked_at" not in existing_columns:
        op.add_column(
            "invitation_recipients",
            sa.Column("thanked_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("invitation_recipients", "thanked_at")
