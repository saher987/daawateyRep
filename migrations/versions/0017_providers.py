"""providers directory: categories, providers, contact-click log

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-22

provider_categories / providers: the public directory of event
professionals (photographers, makeup artists, ...) that admins and managers
maintain from the app. provider_contact_clicks: one row per tap on a
provider's call/WhatsApp/... button, for the per-provider counts admins see.
Seeds a starter set of categories so the directory isn't empty on day one —
all of them editable/hideable from the app afterwards.
"""

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STARTER_CATEGORIES = [
    ("تصوير", "צילום", "camera"),
    ("تصميم وزينة", "עיצוב אירועים", "flower"),
    ("مكياج وتجميل", "איפור וטיפוח", "sparkles"),
    ("حلاقة للعريس", "מספרה לחתן", "scissors"),
    ("بدلات وفساتين", "חליפות ושמלות", "shirt"),
    ("دي جي وفرق", "די ג'יי ולהקות", "music"),
    ("حلويات وكيك", "קינוחים ועוגות", "cake"),
    ("سيارات الزفاف", "רכבי חתונה", "car"),
]


def upgrade() -> None:
    # Guarded like 0006: 0001 creates these tables straight from
    # app/models.py on any database bootstrapped after they were added.
    if "provider_categories" in sa.inspect(op.get_bind()).get_table_names():
        return

    categories = op.create_table(
        "provider_categories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name_ar", sa.String(), nullable=False),
        sa.Column("name_he", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "providers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "category_id",
            sa.String(),
            sa.ForeignKey("provider_categories.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("map_url", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("whatsapp", sa.String(), nullable=True),
        sa.Column("instagram_url", sa.String(), nullable=True),
        sa.Column("facebook_url", sa.String(), nullable=True),
        sa.Column("website_url", sa.String(), nullable=True),
        sa.Column("description_ar", sa.Text(), nullable=True),
        sa.Column("description_he", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(), nullable=True),
        sa.Column("cover_url", sa.String(), nullable=True),
        sa.Column("gallery_urls", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("price_from", sa.Integer(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("is_featured", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_providers_category_id", "providers", ["category_id"])
    op.create_table(
        "provider_contact_clicks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "provider_id",
            sa.String(),
            sa.ForeignKey("providers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_provider_contact_clicks_provider_id", "provider_contact_clicks", ["provider_id"]
    )
    op.create_index(
        "ix_provider_contact_clicks_created_at", "provider_contact_clicks", ["created_at"]
    )

    now = datetime.now(timezone.utc)
    op.bulk_insert(
        categories,
        [
            {
                "id": str(uuid.uuid4()),
                "name_ar": name_ar,
                "name_he": name_he,
                "icon": icon,
                "sort_order": position,
                "is_active": True,
                "created_at": now,
            }
            for position, (name_ar, name_he, icon) in enumerate(_STARTER_CATEGORIES)
        ],
    )


def downgrade() -> None:
    op.drop_table("provider_contact_clicks")
    op.drop_table("providers")
    op.drop_table("provider_categories")
