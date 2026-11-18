"""affiliates

Revision ID: 0033
Revises: 0032
Create Date: 2026-11-18

Affiliate program (app/routers/affiliates.py): affiliates, referrals and
affiliate_commissions, plus the event's price and paid date (the payment
card on EventDetails), venues.affiliate_excluded (a shareholder's venue
earns no commission) and event_requests.referral_code (the code typed on
RequestEventDialog).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column(inspector, table: str, column: sa.Column) -> None:
    # Guarded like 0031: 0001 creates columns straight from app/models.py
    # on any database bootstrapped after this column was added there.
    if column.name not in {col["name"] for col in inspector.get_columns(table)}:
        op.add_column(table, column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _add_column(inspector, "events", sa.Column("price", sa.Numeric(10, 2), nullable=True))
    _add_column(inspector, "events", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    _add_column(
        inspector,
        "venues",
        sa.Column("affiliate_excluded", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _add_column(inspector, "event_requests", sa.Column("referral_code", sa.String(), nullable=True))

    tables = set(inspector.get_table_names())
    if "affiliates" not in tables:
        op.create_table(
            "affiliates",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("phone", sa.String(), nullable=False),
            sa.Column("kind", sa.String(), nullable=True),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("commission_pct", sa.Integer(), nullable=False, server_default="20"),
            sa.Column("repeat_pct", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("excluded", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("application_note", sa.Text(), nullable=True),
            sa.Column("accepted_terms_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_affiliates_phone", "affiliates", ["phone"], unique=True)
        op.create_index("ix_affiliates_code", "affiliates", ["code"], unique=True)

    if "referrals" not in tables:
        op.create_table(
            "referrals",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "affiliate_id", sa.String(), sa.ForeignKey("affiliates.id", ondelete="CASCADE"), nullable=False
            ),
            sa.Column("phone", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_referrals_affiliate_id", "referrals", ["affiliate_id"])
        op.create_index("ix_referrals_phone", "referrals", ["phone"], unique=True)

    if "affiliate_commissions" not in tables:
        op.create_table(
            "affiliate_commissions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "affiliate_id", sa.String(), sa.ForeignKey("affiliates.id", ondelete="CASCADE"), nullable=False
            ),
            sa.Column(
                "referral_id", sa.String(), sa.ForeignKey("referrals.id", ondelete="SET NULL"), nullable=True
            ),
            sa.Column(
                "event_id", sa.String(), sa.ForeignKey("events.id", ondelete="SET NULL"), nullable=True, unique=True
            ),
            sa.Column("event_title", sa.String(), nullable=False),
            sa.Column("event_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("customer_name", sa.String(), nullable=True),
            sa.Column("event_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("pct", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("is_first", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("payout_reference", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_affiliate_commissions_affiliate_id", "affiliate_commissions", ["affiliate_id"])
        op.create_index("ix_affiliate_commissions_status", "affiliate_commissions", ["status"])


def downgrade() -> None:
    op.drop_table("affiliate_commissions")
    op.drop_table("referrals")
    op.drop_table("affiliates")
    op.drop_column("event_requests", "referral_code")
    op.drop_column("venues", "affiliate_excluded")
    op.drop_column("events", "paid_at")
    op.drop_column("events", "price")
