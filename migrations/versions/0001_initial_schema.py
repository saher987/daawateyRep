"""initial schema — all Base44-parity tables

Revision ID: 0001
Revises:
Create Date: 2026-08-11

This bootstrap migration is a deliberate exception to the usual
autogenerate-a-diff workflow (see ../README.md): since it's creating every
table from nothing, it just applies `Base.metadata` directly rather than
hand-transcribing nine CREATE TABLEs — that keeps this file guaranteed to
match backend/app/models.py exactly, with no risk of a manual transcription
error. Every migration *after* this one should be a normal
`alembic revision --autogenerate` diff.
"""

from typing import Sequence, Union

from alembic import op

from app.db import Base
from app import models  # noqa: F401 — import registers tables on Base.metadata

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
