# daawatey

Rebuild of the Base44 app on Google Cloud, driven from scratch.

## Status

✅ Milestone 1 done: Firebase login works end-to-end (Google + email/password), live in both staging and prod.
✅ Milestone 2 done: GitHub Actions → Cloud Run deploy via Workload Identity Federation, both environments live.
✅ Android app working: Capacitor build distributed via Play internal testing, native Google sign-in verified on a Play-installed build.
🚧 Business logic (Base44 parity) in progress, prod-only, web first — see `BUSINESS_LOGIC.md`. Schema + roles/invite flow + events/invitees/RSVP API done and tested against a real Postgres; venues, event requests, notifications, OTP linking, SMS/email, and the frontend pages are next.

## Repo layout

- `/frontend` — React + Vite SPA, wrapped with Capacitor (`frontend/android/`) for the Android app; iOS later
- `/backend` — Python + FastAPI, deployed as a container on Cloud Run
- `/migrations` — Alembic migrations for Postgres/Cloud SQL. Never auto-applied on deploy — run manually against Cloud SQL by you.
- `/.github/workflows/deploy.yml` — manual-trigger deploy to Cloud Run (staging/prod)
- `ARCHITECTURE.md` — environments, mobile/Capacitor auth plan, DB decision
- `BUSINESS_LOGIC.md` — Base44-parity schema, roles/invite flow, API roadmap
- `DEPLOYMENT.md` — GitHub Actions/Cloud Run setup and required secrets

## Environments

Two separate Firebase/GCP projects:
- `daawatey-staging`
- `daawatey-prod`

## Local development

See `frontend/README.md` and `backend/README.md` for per-service setup once they exist.
