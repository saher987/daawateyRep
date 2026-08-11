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

### 4. Database secrets (`prod` only, once Cloud SQL is provisioned)

Not needed until you've run the Cloud SQL setup in `BUSINESS_LOGIC.md`'s
"Infra you need to provision" section. Once that's done, add to `prod`:

| Secret | Value |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://daawatey_app:<PASSWORD>@/daawatey?host=/cloudsql/<CONNECTION_NAME>` |
| `CLOUDSQL_CONNECTION_NAME` | the instance connection name, `PROJECT:REGION:INSTANCE` |

Leaving both unset (e.g. on `staging`, which has no database yet) is a
deliberate no-op — `deploy.yml` only adds the Cloud SQL connection and
`DATABASE_URL` env var when `DATABASE_URL` is actually set.

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

### Native (Capacitor) origins must be included too

The Android/iOS app runs in a WebView whose origin is **not** the frontend's
Cloud Run URL — it's `https://localhost` (Android) or `capacitor://localhost`
(iOS). Those are separate origins as far as CORS is concerned, so they have to
be listed explicitly or every API call from the native app fails. The browser
reports this to JS only as a generic "Failed to fetch", which makes it easy to
misread as a network problem.

So `ALLOWED_ORIGINS` should be, on **both** environments:

```
https://<frontend-cloud-run-url>,https://localhost,capacitor://localhost
```

The login screen's "Build diagnostics" panel prints the actual
`webViewOrigin` at runtime — check that value against this list first when API
calls fail on a device.

Verify what actually landed on the service after deploying (the value is
comma-separated, and `--set-env-vars` is comma-delimited too — see the
escaping note in `deploy.yml`):

```bash
gcloud run services describe daawatey-backend --region=us-central1 \
  --project=daawatey-staging \
  --format="value(spec.template.spec.containers[0].env)"
```

## Running a deploy

Repo → **Actions** tab → **Deploy** workflow → **Run workflow** → choose
`staging` or `prod` → **Run workflow**.
