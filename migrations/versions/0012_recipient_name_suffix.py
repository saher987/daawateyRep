"""invitation_recipients: add nullable name_suffix

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-05

Words that follow a guest's name in the greeting but aren't part of it
("وعائلته", "وخطيبته"), so last_name holds only the family name while the
SMS still reads "حضرة السيد فرنسيس صباح وعائلته".
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invitation_recipients", sa.Column("name_suffix", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("invitation_recipients", "name_suffix")
