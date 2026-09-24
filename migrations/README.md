# migrations

Alembic migrations for the Cloud SQL (Postgres) database — see
`../BUSINESS_LOGIC.md` for the schema and reasoning.

**Nothing here is auto-applied on deploy.** You run these yourself,
whenever you're ready, one of two ways:

## Option A: GitHub Actions button (recommended)

Repo → **Actions** tab → **Run DB Migration** workflow → **Run workflow** →
choose `staging` or `prod` → **Run workflow**. Runs `alembic upgrade head`
in CI using the same Workload Identity Federation auth as the `Deploy`
workflow — no local proxy binary, no venv, no password typing. See
`../DEPLOYMENT.md` for the one-time GCP setup this needs (done once, ever).

## Option B: local script

```bash
cd migrations
export DB_PASSWORD="..."     # daawatey_app's password (prod) or
                              # daawatey_staging_app's (staging)
./migrate.sh          # prod by default
./migrate.sh staging  # or staging
```

Downloads/validates the Cloud SQL Auth Proxy, sets up the venv, starts the
proxy, waits for it to actually be listening, runs `alembic upgrade head`,
then tears the proxy down again — the whole manual dance in one command.
Needs `gcloud auth application-default login` done once beforehand (the
Auth Proxy's own credential, separate from `gcloud auth login`).

## Option C: fully manual (what both of the above automate)

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
