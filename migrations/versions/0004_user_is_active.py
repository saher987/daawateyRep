"""users.is_active — admin deactivate/ban, distinct from self-delete

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-15

Backs the admin "delete user" action in app/routers/users.py: deactivating
an unwanted account sets this to False (and disables the Firebase account)
instead of removing the row, because invitation_recipients.user_id is a
real FK to users.id (RESTRICT — no ondelete set) and events/venues that user
created stay live for real guests. See models.User.is_active's docstring.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0003: 0001 is a "living" migration that creates
    # is_active straight from app/models.py on any database bootstrapped
    # from scratch after this column was added there — add_column would
    # DuplicateColumn on those.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    if "is_active" not in existing_columns:
        op.add_column(
            "users",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        )
        # Match app/models.py: no ORM-level default should mean a DB-level
        # default forever — server_default was only needed to backfill
        # existing rows on this ALTER TABLE.
        op.alter_column("users", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "is_active")
