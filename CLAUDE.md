# CLAUDE.md

Standing notes for Claude sessions on this repo. Each session starts with no
memory of earlier ones, so anything a session should know every time goes
here. Details live in the docs below; keep this file short.

## The app

Daawatey (دعوتي): event invitations, RSVPs, reminders and thank-yous for
guests, mostly in Arabic. Rebuild of a Base44 app on Google Cloud.

- `frontend/` — React + Vite SPA (Tailwind, shadcn/ui). Calls the backend
  through `src/api/base44Client.js`, a shim that keeps the original Base44
  call names (`base44.functions.invoke("…")`, `base44.entities.X`).
- `backend/` — Python + FastAPI on Cloud Run. Most event, guest and send
  logic is in `backend/app/routers/events.py`. Request/response shapes are
  in `schemas.py`, and the DB models in `models.py` (the source of truth for
  the schema).
- `migrations/` — Alembic, Postgres (Cloud SQL).
- Docs: `ARCHITECTURE.md` (environments, mobile, auth), `DEPLOYMENT.md`
  (workflows, secrets, env vars such as `INVITATION_CHANNEL`),
  `BUSINESS_LOGIC.md` (schema, roles, infra), `BACKLOG.md` (planned and
  deferred work), `migrations/README.md`.

## Rules

- **UI language:** every screen is right-to-left. Every new UI string goes in
  `frontend/src/lib/i18n.jsx` in **both** `ar` and `he`. Read text through
  `useT()`, never hard-coded.
- **Roles:** `admin`, `manager`, `venue_owner`, `user`. Anything that sends
  paid messages (SMS/WhatsApp), such as bulk thank-yous and reminders, is
  admin/manager only, on the server (`require_role`) and in the UI
  (`isPrivileged`).
- **Messaging:** invitations, reminders and thank-yous follow
  `INVITATION_CHANNEL` (`sms`, `whatsapp`, or `whatsapp_then_sms`). Every
  send writes an audit row (`app/audit.py`).
- **Bulk sends** go through `frontend/src/hooks/useBatchSend.js`, which
  sends batches of 10 with progress, pause, stop and retry. The UI is
  `components/events/BatchSendProgress.jsx`, with a confirmation step first.
  The backend endpoints are `/events/{id}/send-thanks-batch` and
  `/events/{id}/send-reminders-batch`. Keep the older endpoints too:
  installed phone apps still call them.
- **Migrations:** change `models.py`, then add a numbered file in
  `migrations/versions/` (next number after the last one). Guard
  `add_column` with an inspector check, as the existing files do. A new
  column must also be added to `schemas.RecipientOut` (or the matching
  schema) to reach the frontend.
- **Code comments** explain *why*, and name the screen or endpoint on the
  other side. Follow the existing style.

## Release (manual, GitHub Actions)

Nothing deploys or migrates on push. In order:

1. Merge the PR into `main`. This repo uses **squash merge**.
2. If there is a new migration: **Run DB Migration** (`migrate.yml`), prod.
   Always run it before Deploy, because the new backend reads the new
   columns.
3. **Deploy** (`deploy.yml`), prod. This updates the backend and the website.

Environments: `staging` and `prod` are separate GCP/Firebase projects, but
they share one Cloud SQL instance (prod's), with separate databases.

Running the migration or deploy on prod is the owner's call each time: ask
first, or let them run it.

## Phone app

The Android/iOS app (Capacitor, `frontend/android`, iOS via workflows)
**packages the web build** (`webDir: 'dist'`). It does not load the
website, so a frontend change reaches phones only through a new mobile
release build (`android-release-build.yml`, `ios-release-build.yml`) and a
store upload. After a Play upload, bump `ANDROID_LATEST_VERSION_CODE` (see
`DEPLOYMENT.md`). **Do not start mobile builds unless the owner asks.**

## Checks before pushing

- Frontend: `cd frontend && npx oxlint <changed files>` and `npx vite build`.
  There are existing lint warnings; only check for new ones.
- Backend: no test suite yet. At least `python -c "import ast; ast.parse(...)"`
  on changed files. For logic changes, exercise the endpoint function with
  fake senders. The models use Postgres types (`ARRAY`, `JSONB`), so SQLite
  needs compile shims.
- Every text you add exists in both `ar` and `he` in `i18n.jsx`.
