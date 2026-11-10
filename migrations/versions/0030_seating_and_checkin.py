"""table arrangement (seating) and entrance check-in

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-10

Both features are optional per event and off by default, so every existing
event keeps working exactly as before:

- events: seating_enabled, checkin_enabled, seating_published,
  seating_locked_at
- invitation_recipients.side: groom / bride / both (empty = none), the first
  level of seating groups; group_label stays the second level
- event_tables, seating_assignments, event_hall_elements: the hall plan and
  who sits where (several assignment rows = a split family)
- check_ins: one row per invitation that arrived at the entrance

See app/routers/seating.py and app/routers/checkin.py.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SIDE_VALUES = ("groom", "bride", "both")


def upgrade() -> None:
    # Guarded like 0013/0017: 0001 creates tables and columns straight from
    # app/models.py on any database bootstrapped after they were added.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    event_columns = {col["name"] for col in inspector.get_columns("events")}
    for name in ("seating_enabled", "checkin_enabled", "seating_published"):
        if name not in event_columns:
            op.add_column(
                "events",
                sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
    if "seating_locked_at" not in event_columns:
        op.add_column(
            "events", sa.Column("seating_locked_at", sa.DateTime(timezone=True), nullable=True)
        )

    side_enum = postgresql.ENUM(*_SIDE_VALUES, name="recipient_side", create_type=False)
    side_enum.create(bind, checkfirst=True)
    recipient_columns = {col["name"] for col in inspector.get_columns("invitation_recipients")}
    if "side" not in recipient_columns:
        op.add_column("invitation_recipients", sa.Column("side", side_enum, nullable=True))

    tables = set(inspector.get_table_names())
    if "event_tables" not in tables:
        op.create_table(
            "event_tables",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "event_id",
                sa.String(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("number", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("zone", sa.String(), nullable=True),
            sa.Column("shape", sa.String(), nullable=False),
            sa.Column("seats_round", sa.Integer(), nullable=False),
            sa.Column("seats_top", sa.Integer(), nullable=False),
            sa.Column("seats_bottom", sa.Integer(), nullable=False),
            sa.Column("seats_left", sa.Integer(), nullable=False),
            sa.Column("seats_right", sa.Integer(), nullable=False),
            sa.Column("x", sa.Integer(), nullable=False),
            sa.Column("y", sa.Integer(), nullable=False),
            sa.Column("rotation", sa.Integer(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_event_tables_event_id", "event_tables", ["event_id"])

    if "seating_assignments" not in tables:
        op.create_table(
            "seating_assignments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "recipient_id",
                sa.String(),
                sa.ForeignKey("invitation_recipients.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "table_id",
                sa.String(),
                sa.ForeignKey("event_tables.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("seats", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint(
                "recipient_id", "table_id", name="uq_seating_assignment_recipient_table"
            ),
        )
        op.create_index(
            "ix_seating_assignments_recipient_id", "seating_assignments", ["recipient_id"]
        )
        op.create_index("ix_seating_assignments_table_id", "seating_assignments", ["table_id"])

    if "event_hall_elements" not in tables:
        op.create_table(
            "event_hall_elements",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "event_id",
                sa.String(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("x", sa.Integer(), nullable=False),
            sa.Column("y", sa.Integer(), nullable=False),
            sa.Column("w", sa.Integer(), nullable=False),
            sa.Column("h", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_event_hall_elements_event_id", "event_hall_elements", ["event_id"])

    if "check_ins" not in tables:
        op.create_table(
            "check_ins",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "event_id",
                sa.String(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "recipient_id",
                sa.String(),
                sa.ForeignKey("invitation_recipients.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("people_arrived", sa.Integer(), nullable=False),
            sa.Column("method", sa.String(), nullable=False),
            sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_check_ins_event_id", "check_ins", ["event_id"])


def downgrade() -> None:
    op.drop_table("check_ins")
    op.drop_table("event_hall_elements")
    op.drop_table("seating_assignments")
    op.drop_table("event_tables")
    op.drop_column("invitation_recipients", "side")
    sa.Enum(name="recipient_side").drop(op.get_bind(), checkfirst=True)
    op.drop_column("events", "seating_locked_at")
    op.drop_column("events", "seating_published")
    op.drop_column("events", "checkin_enabled")
    op.drop_column("events", "seating_enabled")
