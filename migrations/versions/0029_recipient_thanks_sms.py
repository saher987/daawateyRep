"""invitation_recipients.thanks_sms

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-09

The SMS text of the last thank-you that went out by WhatsApp, as filled in
by the dialog. If Meta later reports that WhatsApp as undelivered, the
webhook sends this SMS instead (events.py send_thanks_sms_fallback).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("invitation_recipients")}
    if "thanks_sms" not in existing_columns:
        op.add_column("invitation_recipients", sa.Column("thanks_sms", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("invitation_recipients", "thanks_sms")
