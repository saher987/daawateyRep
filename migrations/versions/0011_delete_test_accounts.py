"""data cleanup: delete a fixed list of test/bot user accounts

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-03

Removes specific accounts by email. Most of them are automated store
review/pre-launch test sign-ins (Apple private-relay, Google Cloud Test
Lab, and the generated firstnamelastname.NNNNN@gmail.com pattern).

Same end result as DELETE /api/account (a real hard delete), with one
extra step: invitation_recipients.user_id is a real FK to users.id with
no ondelete (RESTRICT), so any recipient rows linked to these accounts
are unlinked first (user_id -> NULL, as for a guest with no account)
rather than deleted, keeping the hosts' guest lists intact.
push_tokens go away on their own (ON DELETE CASCADE).

Only touches the Postgres rows; the Firebase Auth accounts are left
alone, so any of these that sign in again get a fresh row from
app.auth.get_app_user. Prints how many rows it touched.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


EMAILS = [
    "gf8g5p7pbz@privaterelay.appleid.com",
    "v7jk7cz8jf@privaterelay.appleid.com",
    "rogersimpson.73102@gmail.com",
    "dustinpearson.89341@gmail.com",
    "brandonfoster.17492@gmail.com",
    "silvialambert.17973@gmail.com",
    "edmundstrickland.50187@gmail.com",
    "karolynmccorkle.95291@gmail.com",
    "shaneriley.97927@gmail.com",
    "timweaver.88845@gmail.com",
    "doramatthews.98148@gmail.com",
    "abrahamgonzales.73716@gmail.com",
    "calebray.40733@gmail.com",
    "genevacarroll.05587@gmail.com",
    "lenagray.70008@gmail.com",
    "sf3miqrtmynmg3er2kkouupzei-00@cloudtestlabaccounts.com",
    "clairetorres.25379@gmail.com",
    "bennyfowler.89385@gmail.com",
    "macksandoval.85491@gmail.com",
    "philnewman.37519@gmail.com",
    "taylorstanley.99140@gmail.com",
    "tatumantonio.49195@gmail.com",
    "joelstokes.59629@gmail.com",
    "stephaniareedy.92725@gmail.com",
    "dorisford.20765@gmail.com",
]


def upgrade() -> None:
    bind = op.get_bind()
    emails = [e.lower() for e in EMAILS]

    user_ids = [
        row.id
        for row in bind.execute(
            sa.text("SELECT id FROM users WHERE lower(email) = ANY(:emails)"),
            {"emails": emails},
        )
    ]
    if not user_ids:
        print("[0011] no matching users found, nothing to delete")
        return

    unlinked = bind.execute(
        sa.text("UPDATE invitation_recipients SET user_id = NULL WHERE user_id = ANY(:ids)"),
        {"ids": user_ids},
    ).rowcount
    deleted = bind.execute(
        sa.text("DELETE FROM users WHERE id = ANY(:ids)"),
        {"ids": user_ids},
    ).rowcount

    print(
        f"[0011] deleted {deleted} of {len(EMAILS)} listed user(s); "
        f"unlinked {unlinked} invitation_recipients row(s)"
    )


def downgrade() -> None:
    # Not reversible — deleted rows can't be restored. No-op.
    pass
