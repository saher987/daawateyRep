"""events.thank_you_event_name / thank_you_event_owners

Revision ID: 0021
Revises: 0020
Create Date: 2026-11-03

The WhatsApp thank-you template's {{event_name}} and {{event_owners}},
editable per event apart from the title / host name. Null means those.
See app/routers/events.py's send_thanks.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded like 0013: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after these columns were added there.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("events")}
    for name in ("thank_you_event_name", "thank_you_event_owners"):
        if name not in existing_columns:
            op.add_column("events", sa.Column(name, sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "thank_you_event_owners")
    op.drop_column("events", "thank_you_event_name")
