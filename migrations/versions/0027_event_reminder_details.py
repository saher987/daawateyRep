"""events.reminder_details

Revision ID: 0027
Revises: 0026
Create Date: 2026-11-04

The reminder's free-text middle, shared by both reminder groups and sent
as {{2}} of the WhatsApp reminder templates (or inside the SMS). See
app/routers/events.py's send_reminders.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("events")}
    if "reminder_details" not in existing_columns:
        op.add_column("events", sa.Column("reminder_details", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "reminder_details")
