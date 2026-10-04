"""invitation_recipients: add nullable town

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-04

Lets the inviter record a city for a guest with no account, so it shows
in the guest list/export like a registered user's own town does.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invitation_recipients", sa.Column("town", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("invitation_recipients", "town")
