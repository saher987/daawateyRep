"""events.whatsapp_invitation_text — the WhatsApp invitation's own text

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-03

{{2}} of the universal WhatsApp invitation template, written per event
apart from invitation_greeting, which stays the SMS/email text. See
app/routers/events.py's _whatsapp_invitation.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("events")}
    if "whatsapp_invitation_text" not in existing_columns:
        op.add_column("events", sa.Column("whatsapp_invitation_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "whatsapp_invitation_text")
