# backend

Python + FastAPI, deployed as a container on Cloud Run.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then `curl localhost:8000/healthz` → `{"status": "ok"}`.

## Docker

```bash
docker build -t daawatey-backend .
docker run -p 8080:8080 daawatey-backend
```

## Auth

Every protected route verifies the caller's Firebase ID token via the Firebase
Admin SDK (`app/auth.py`) and derives identity only from the verified token —
never from a client-supplied user id.

`GET /api/me` is the proof this works: it returns 401 with no/invalid token,
and the verified `uid`/`email` with a real Firebase ID token attached.

### Local credentials

The Admin SDK needs Application Default Credentials to verify tokens against
a specific Firebase/GCP project. One-time login:

```bash
gcloud auth application-default login
```

**`GOOGLE_CLOUD_PROJECT` must also be set every time you run the server** —
user-login ADC (unlike a service account) doesn't carry a project id on its
own, so `gcloud config set project` alone isn't enough; without this env var
`verify_id_token()` fails with "A project ID is required to access the auth
service.":

```bash
export GOOGLE_CLOUD_PROJECT=daawatey-staging
uvicorn app.main:app --reload
```

No service account key file is ever committed to this repo. On Cloud Run,
the service's attached service account is used automatically (set up in
Milestone 2) — no local setup needed there.

## Database

Business logic (events, invitees, venues, etc. — see `../BUSINESS_LOGIC.md`)
is backed by Postgres. Every route that touches the database needs
`DATABASE_URL` set, or it fails with a clear `RuntimeError` rather than a
confusing lower-level error:

```bash
export DATABASE_URL="postgresql+psycopg://USER:PASSWORD@127.0.0.1:5432/daawatey"
```

For local dev, the simplest option is a local Postgres (`apt install
postgresql`, or Docker). Against Cloud SQL, run the Cloud SQL Auth Proxy and
point `DATABASE_URL` at `127.0.0.1:<proxy port>` — see `../BUSINESS_LOGIC.md`
for the exact provisioning commands once you're setting up `daawatey-prod`'s
instance.

Schema changes go through Alembic migrations in `/migrations` — **run
manually, never automatically on deploy**:

```bash
cd ../migrations
alembic upgrade head
```

See `/migrations/README.md`.
