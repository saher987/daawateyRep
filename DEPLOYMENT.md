# Deployment (Milestone 2)

GitHub Actions builds both containers and deploys them to Cloud Run,
authenticating to GCP via Workload Identity Federation — no service account
key files anywhere. Triggered manually, with a choice of environment.

## One-time GitHub setup

### 1. Create two GitHub Environments

Repo → **Settings → Environments** → **New environment**, create:
- `staging`
- `prod`

Each environment holds its own set of secrets below — this is what lets one
workflow file safely target either environment without ever mixing up
staging/prod credentials.

### 2. Add these secrets to the `staging` environment

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | `daawatey-staging` |
| `WIF_PROVIDER` | `projects/742481007794/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `DEPLOY_SA_EMAIL` | `github-deployer@daawatey-staging.iam.gserviceaccount.com` |
| `RUNTIME_SA_EMAIL` | `backend-runtime@daawatey-staging.iam.gserviceaccount.com` |
| `ALLOWED_ORIGINS` | the frontend's Cloud Run URL (see bootstrapping note below — leave as `http://localhost:5173` for the very first run) |
| `VITE_FIREBASE_API_KEY` | from `daawatey-staging`'s web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `daawatey-staging.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `daawatey-staging` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `daawatey-staging.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `742481007794` |
| `VITE_FIREBASE_APP_ID` | from `daawatey-staging`'s web app config |

### 3. Add the equivalent secrets to the `prod` environment

Same keys, `daawatey-prod` values (project number `1046309287701`, provider
path uses that project number, service account emails use
`@daawatey-prod.iam.gserviceaccount.com`, Firebase values from the prod web
app config).

## Bootstrapping `ALLOWED_ORIGINS` (first deploy only)

The backend needs to know the frontend's origin for CORS, but the frontend's
Cloud Run URL doesn't exist until after its first deploy — chicken-and-egg.
For the very first run on each environment:

1. Leave `ALLOWED_ORIGINS` as `http://localhost:5173` (or anything) and run
   the workflow once.
2. After it finishes, find the frontend service's URL — either from the
   workflow's deploy step output, or:
   ```bash
   gcloud run services describe daawatey-frontend --region=us-central1 --format="value(status.url)"
   ```
3. Update the `ALLOWED_ORIGINS` secret to that real URL.
4. Re-run the workflow (or just redeploy the backend) so CORS picks it up.

## Running a deploy

Repo → **Actions** tab → **Deploy** workflow → **Run workflow** → choose
`staging` or `prod` → **Run workflow**.
