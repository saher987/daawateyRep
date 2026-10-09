"""event_type: add 'appreciation' (حفل شكر وتكريم)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-03

Postgres enum types require an explicit ALTER TYPE to add a new value —
unlike every other column change here, this can't go through a plain
autogenerate diff. ADD VALUE can't run inside the same transaction as
other schema changes that might use it, hence the standalone
AUTOCOMMIT block.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'appreciation'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enum types — removing one requires
    # rebuilding the type from scratch (rename old, create new without the
    # value, cast every usage, drop old), which only makes sense to do if
    # this is ever actually rolled back; not worth the ceremony up front
    # for a migration that just adds an option.
    pass
