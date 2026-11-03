"""events: drop whatsapp_template

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-03

The per-event choice of WhatsApp wording (default / تأهيل ولده / ابنته,
added in 0020) is gone: every invitation uses the universal template with
the event's own WhatsApp text (0023).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_columns = {col["name"] for col in sa.inspect(bind).get_columns("events")}
    if "whatsapp_template" in existing_columns:
        op.drop_column("events", "whatsapp_template")


def downgrade() -> None:
    op.add_column(
        "events",
        sa.Column("whatsapp_template", sa.String(), nullable=False, server_default="default"),
    )
