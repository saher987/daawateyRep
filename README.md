# daawatey

Rebuild of the Base44 app on Google Cloud, driven from scratch.

## Status

✅ Milestone 1 done: Firebase login works end-to-end (Google + email/password), verified by the backend.
🚧 Milestone 2 in progress: GitHub Actions → Cloud Run deploy via Workload Identity Federation.

## Repo layout

- `/frontend` — React + Vite SPA (will later be wrapped with Capacitor for iOS/Android)
- `/backend` — Python + FastAPI, deployed as a container on Cloud Run
- `/migrations` — relational DB schema/migration scripts (added once we pick Firestore vs. Cloud SQL). Never auto-applied on deploy — run manually against Cloud SQL by you.
- `/.github/workflows/deploy.yml` — manual-trigger deploy to Cloud Run (staging/prod)
- `ARCHITECTURE.md` — environments, mobile/Capacitor auth plan, DB tradeoffs
- `DEPLOYMENT.md` — GitHub Actions/Cloud Run setup and required secrets

## Environments

Two separate Firebase/GCP projects:
- `daawatey-staging`
- `daawatey-prod`

## Local development

See `frontend/README.md` and `backend/README.md` for per-service setup once they exist.
