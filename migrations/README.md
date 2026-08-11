# migrations

Alembic migrations for the Cloud SQL (Postgres) database — see
`../BUSINESS_LOGIC.md` for the schema and reasoning.

**Nothing here is auto-applied on deploy.** You run these yourself, against
Cloud SQL, whenever you're ready:

```bash
cd migrations
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Cloud SQL Auth Proxy must be running locally, or use a private-IP/direct
# connection string — see BUSINESS_LOGIC.md's infra section for exact
# provisioning + connection commands.
export DATABASE_URL="postgresql+psycopg://USER:PASSWORD@localhost:5432/daawatey"

alembic upgrade head        # apply all pending migrations
alembic current             # see what's applied
alembic history              # see all revisions
```

## Creating a new migration

The SQLAlchemy models in `backend/app/models.py` are the source of truth for
the schema. After changing them:

```bash
cd migrations
export DATABASE_URL="postgresql+psycopg://USER:PASSWORD@localhost:5432/daawatey"
alembic revision --autogenerate -m "describe the change"
```

Then **read the generated file** in `versions/` before running `alembic
upgrade head` — autogenerate is a good first draft, not a guarantee (it
doesn't detect column renames, for instance, and will generate a drop+add
instead).
