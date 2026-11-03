"""provider_categories.image_url

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-03

An optional cover photo per services category, shown as a photo card on
the services page. Categories without one keep the icon card.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("provider_categories")}
    if "image_url" not in existing_columns:
        op.add_column("provider_categories", sa.Column("image_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("provider_categories", "image_url")
