"""Give the leftover owner_emails/manager_emails columns a default

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-01

0007 added owner_phones/manager_phones with server_default="{}" but left
the old owner_emails/manager_emails columns in place as a safety net
(see 0007's own docstring) — without carrying the same default over to
them. Since then, neither Venue nor Event's model/schema has mentioned
owner_emails/manager_emails at all, so a normal create_venue/create_event
INSERT never supplies a value for these still-NOT-NULL, no-default
columns, which Postgres rejects outright: every venue and event created
through the app since 0007 shipped would hit this (confirmed in prod via
a "Failed to fetch"/500 on POST /api/venues — the generic 500 drops
CORS headers, which is what actually surfaces client-side). Existing
rows from before 0007 are untouched and already have real values here,
so this never affected reads/listing, only inserts.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("venues", "owner_emails", server_default="{}")
    op.alter_column("events", "owner_emails", server_default="{}")
    op.alter_column("events", "manager_emails", server_default="{}")


def downgrade() -> None:
    op.alter_column("venues", "owner_emails", server_default=None)
    op.alter_column("events", "owner_emails", server_default=None)
    op.alter_column("events", "manager_emails", server_default=None)
