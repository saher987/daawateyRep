"""notifications.link

Revision ID: 0031
Revises: 0030
Create Date: 2026-11-13

An in-app path a notification opens on tap when it isn't about one event:
the "new event request" notification to admins/managers opens
/event-requests (event_requests.py create_event_request, Notifications.jsx).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("notifications")}
    if "link" not in existing_columns:
        op.add_column("notifications", sa.Column("link", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("notifications", "link")
