"""users.phone — unique (NULL-safe: NULLs never collide with each other)

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-17

A phone-OTP login bug (see app/routers/otp.py, commit 606d52c) surfaced a
real case: two accounts sharing a phone number, one later admin-disabled.
The app-layer fix stopped login from matching the wrong (deactivated) one,
but nothing actually prevented the duplicate from being created in the
first place — this migration closes that at the data layer.

Before adding the constraint, null out `phone` on any already-deactivated
row that collides with another row's phone: a disabled account has no
further use for it, and leaving it in place only risks the exact bug just
fixed recurring, now at the DB layer instead of the app layer. Any
*active*-vs-*active* collision left after that makes the constraint step
below fail loudly with Postgres's own "duplicate key value violates unique
constraint" error, naming the exact colliding phone — a genuinely
ambiguous case (which of two live accounts should keep the number?) that
needs a human decision, not something safe to resolve automatically here.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Explicit name for whichever path actually creates it below — but a fresh
# database's 0001 (a "living" migration, see its own docstring) creates
# this constraint via plain `unique=True` in app/models.py instead, which
# Postgres names on its own (conventionally "users_phone_key"). Rather
# than guess/hardcode that name, both functions below look the constraint
# up by which column it actually covers.
_NEW_CONSTRAINT_NAME = "uq_users_phone"


def _existing_phone_unique_constraint(bind) -> str | None:
    inspector = sa.inspect(bind)
    for uc in inspector.get_unique_constraints("users"):
        if uc["column_names"] == ["phone"]:
            return uc["name"]
    return None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET phone = NULL
        WHERE is_active = false
          AND phone IS NOT NULL
          AND phone IN (
              SELECT phone FROM users
              WHERE phone IS NOT NULL
              GROUP BY phone
              HAVING count(*) > 1
          )
        """
    )

    # Guarded like 0003/0004: skip if 0001's living-migration path already
    # created this (under whatever name Postgres chose) on this database.
    if _existing_phone_unique_constraint(op.get_bind()) is None:
        op.create_unique_constraint(_NEW_CONSTRAINT_NAME, "users", ["phone"])


def downgrade() -> None:
    name = _existing_phone_unique_constraint(op.get_bind())
    if name is not None:
        op.drop_constraint(name, "users", type_="unique")
