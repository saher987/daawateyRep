"""otp_verifications.attempts — failed-guess counter

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-13

Backs the /otp/verify brute-force fix in app/routers/otp.py: a wrong guess
against the active code now increments this and locks the code out (marks
it used) after 5 wrong guesses, instead of tolerating unlimited guesses at
whatever rate a script can send them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "otp_verifications",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    # Match app/models.py: no ORM-level default should mean a DB-level
    # default forever — server_default was only needed to backfill existing
    # rows on this ALTER TABLE.
    op.alter_column("otp_verifications", "attempts", server_default=None)


def downgrade() -> None:
    op.drop_column("otp_verifications", "attempts")
