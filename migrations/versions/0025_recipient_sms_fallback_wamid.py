"""invitation_recipients.sms_fallback_wamid

Revision ID: 0025
Revises: 0024
Create Date: 2026-11-04

When Meta reports a WhatsApp invitation as failed (webhook), the guest is
sent the SMS invitation instead; this records which WhatsApp message that
was for, so a repeated webhook doesn't send the SMS twice. See
app/routers/events.py's send_invitation_sms_fallback.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    existing_columns = {col["name"] for col in sa.inspect(bind).get_columns("invitation_recipients")}
    if "sms_fallback_wamid" not in existing_columns:
        op.add_column("invitation_recipients", sa.Column("sms_fallback_wamid", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("invitation_recipients", "sms_fallback_wamid")
