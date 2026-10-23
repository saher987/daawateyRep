"""provider self-listing: owner + review status on providers

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-23

Lets a business list itself in the providers directory from the app
("List your business"), instead of only admins/managers adding it.
providers.owner_user_id: the signed-in user who submitted the listing
(NULL for listings admins added themselves). providers.review_status:
pending / approved / rejected — every existing row is approved, since an
admin or manager already added it. providers.review_note: the reason shown
to the owner when a submission is rejected.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {col["name"] for col in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # Guarded like 0016: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after these were added there.
    providers = _columns("providers")
    if "owner_user_id" not in providers:
        op.add_column(
            "providers",
            sa.Column(
                "owner_user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index("ix_providers_owner_user_id", "providers", ["owner_user_id"])
    if "review_status" not in providers:
        op.add_column(
            "providers",
            sa.Column("review_status", sa.String(), nullable=False, server_default="approved"),
        )
    if "review_note" not in providers:
        op.add_column("providers", sa.Column("review_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("providers", "review_note")
    op.drop_column("providers", "review_status")
    op.drop_index("ix_providers_owner_user_id", table_name="providers")
    op.drop_column("providers", "owner_user_id")
