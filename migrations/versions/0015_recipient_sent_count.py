"""invitation_recipients: add sent_count

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-20

How many times the invitation actually went out to a guest (the initial
invite plus every resend), shown next to each row in the event's guest
list. Existing rows start at 0 — past sends weren't recorded.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invitation_recipients",
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("invitation_recipients", "sent_count")
