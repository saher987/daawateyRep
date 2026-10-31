"""events.whatsapp_template — which WhatsApp template invitations use

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-31

Chosen when creating/editing the event: "default" (the generic
templates), or "tahil_son" / "tahil_daughter" (حفل تأهيل ولده/ابنته).
Existing events get "default", i.e. no change. See
app/integrations/whatsapp.py.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("events")}
    if "whatsapp_template" not in existing_columns:
        op.add_column(
            "events",
            sa.Column("whatsapp_template", sa.String(), nullable=False, server_default="default"),
        )


def downgrade() -> None:
    op.drop_column("events", "whatsapp_template")
