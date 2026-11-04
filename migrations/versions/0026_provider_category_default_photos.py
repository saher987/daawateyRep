"""provider_categories: starting cover photos

Revision ID: 0026
Revises: 0025
Create Date: 2026-11-04

Fills provider_categories.image_url (added in 0022) with a free Unsplash
photo for each existing services category. Data only, and only for
categories that don't have a photo yet, so anything an admin already set
from إدارة الخدمات → الفئات is left alone. Categories are matched by Arabic
name, either the 0017 starter name or the name they were renamed to,
ignoring surrounding spaces and ة/ه. Every match is printed, so the
migration run's log shows what changed.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _unsplash(photo_id: str) -> str:
    return f"https://images.unsplash.com/photo-{photo_id}?w=800&q=80&fit=crop"


# (Arabic names this category may have, Unsplash photo id)
_PHOTOS = [
    (("تصوير",), "1516035069371-29a1b244cc32"),
    (("تصميم وزينة", "تصميم وزينة وهدايا"), "1519225421980-715cb0215aed"),
    (("مكياج وتجميل", "مكياج وشعر"), "1516975080664-ed2fc6a32937"),
    (("حلاقة للعريس",), "1503951914875-452162b0f3f1"),
    (("بدلات وفساتين",), "1550005809-91ad75fb315f"),
    (("دي جي وفرق",), "1470229722913-7c0e2dbbafd3"),
    (("حلويات وكيك",), "1535141192574-5d4897c12636"),
    (("سيارات الزفاف",), "1503376780353-7e6692767b70"),
    (("شيف وطبخ",), "1577219491135-ce391730fb2c"),
    (("كوسمتيكا وعلاجات بشرة",), "1617897903246-719242758050"),
]


def _normalize(name: str) -> str:
    return " ".join(name.split()).replace("ة", "ه")


def upgrade() -> None:
    bind = op.get_bind()
    by_name = {_normalize(n): _unsplash(pid) for names, pid in _PHOTOS for n in names}
    rows = bind.execute(
        sa.text(
            "SELECT id, name_ar FROM provider_categories "
            "WHERE image_url IS NULL OR image_url = ''"
        )
    ).all()
    for category_id, name_ar in rows:
        url = by_name.get(_normalize(name_ar or ""))
        if url is None:
            print(f"0026: no photo for category {name_ar!r}, left as icon")
            continue
        bind.execute(
            sa.text("UPDATE provider_categories SET image_url = :url WHERE id = :id"),
            {"url": url, "id": category_id},
        )
        print(f"0026: set photo for category {name_ar!r}")


def downgrade() -> None:
    # Data only; the photos stay. Clear them from the admin panel if needed.
    pass
