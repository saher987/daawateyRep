# daawatey

Rebuild of the Base44 app on Google Cloud, driven from scratch.

## Status

🚧 Milestone 1 in progress: get a user signed in end-to-end via Firebase Authentication.

## Repo layout

- `/frontend` — React + Vite SPA (will later be wrapped with Capacitor for iOS/Android)
- `/backend` — Python + FastAPI, deployed as a container on Cloud Run
- `/migrations` — relational DB schema/migration scripts (added once we pick Firestore vs. Cloud SQL). Never auto-applied on deploy — run manually against Cloud SQL by you.
- `/.github/workflows` — CI/CD (added in Milestone 2)
- `ARCHITECTURE.md` — environments, mobile/Capacitor auth plan, DB tradeoffs

## Environments

Two separate Firebase/GCP projects:
- `daawatey-staging`
- `daawatey-prod`

## Local development

See `frontend/README.md` and `backend/README.md` for per-service setup once they exist.
