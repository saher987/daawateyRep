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
    # Guarded rather than a bare add_column: 0001 is a "living" migration
    # (it runs Base.metadata.create_all against whatever app/models.py
    # looks like *at the time it's applied*, see its own docstring) — on
    # any database bootstrapped from scratch after this column was added
    # to models.py, 0001 already creates otp_verifications.attempts, and
    # a plain add_column here fails with DuplicateColumn. Confirmed live
    # while bootstrapping the staging database. 0002's drop+create-
    # constraint approach happens to be safe either way; add_column isn't,
    # so it needs this check explicitly.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("otp_verifications")}
    if "attempts" not in existing_columns:
        op.add_column(
            "otp_verifications",
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        )
        # Match app/models.py: no ORM-level default should mean a DB-level
        # default forever — server_default was only needed to backfill
        # existing rows on this ALTER TABLE.
        op.alter_column("otp_verifications", "attempts", server_default=None)


def downgrade() -> None:
    op.drop_column("otp_verifications", "attempts")
