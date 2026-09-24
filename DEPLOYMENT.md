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
| `VITE_FIREBASE_VAPID_KEY` | Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → generate/copy the key pair (not sensitive, same visibility as the other `VITE_FIREBASE_*` values — web push registration in lib/push.js just silently no-ops without it) |
| `ANDROID_LATEST_VERSION_CODE` | Optional. The `versionCode` of the most recently uploaded Android build (see `android/app/build.gradle` / the Play Console release you just submitted). Bump this by hand after every Play Console upload — it's what `UpdateAvailableBanner.jsx` compares an installed app's own version against to show the "update available" nudge. Unset means the banner never shows, never a failure. |

### 3. Add the equivalent secrets to the `prod` environment

Same keys, `daawatey-prod` values (project number `1046309287701`, provider
path uses that project number, service account emails use
`@daawatey-prod.iam.gserviceaccount.com`, Firebase values from the prod web
app config).

### 4. Database + invitation-delivery secrets (`prod` only)

Not needed until you've run the Cloud SQL setup in `BUSINESS_LOGIC.md`'s
"Infra you need to provision" section. **The actual sensitive values —
the DB password, Pulseem API key, Resend API key — live in Google Secret
Manager, not as GitHub secrets.** `--set-secrets` passes Cloud Run only
the *secret name* (not sensitive); the value itself is injected into the
container by Cloud Run at startup and never appears in the service
config, `gcloud run services describe`, or a deploy's audit log — unlike
`--set-env-vars`, which is exactly how the DB password briefly showed up
in plaintext in an audit log while debugging this before the switch. See
BUSINESS_LOGIC.md for the `gcloud secrets create` / IAM-grant commands.

Only these go in GitHub, `prod` environment — genuinely just identifiers,
safe as plain secrets (or even hardcoded, kept as secrets here mainly for
symmetry with everything else in this table):

| Secret | Value |
|---|---|
| `CLOUDSQL_CONNECTION_NAME` | the instance connection name, `PROJECT:REGION:INSTANCE` |
| `APP_URL` | the frontend's public URL, e.g. `https://daawatey-frontend-t3tobt7bfq-uc.a.run.app` — used to build the `/i/<token>` invitation link sent in the SMS/email |
| `RESEND_FROM_EMAIL` | `noreply@daawatey.com` (bare address only — see warning below) |

**`RESEND_FROM_EMAIL` must be a bare email address, no `Display Name <...>`
wrapping and no spaces.** This value rides through `deploy.yml`'s `flags:`
string for `google-github-actions/deploy-cloudrun`, which tokenizes on
whitespace with no quote-awareness — a value like `Daawatey
<noreply@daawatey.com>` silently splits into two arguments and fails the
whole deploy with `unrecognized arguments: <noreply@daawatey.com>` (this
happened for real — see git history). The "Daawatey" display name is
applied in code (`resend_email.py`) instead, where a space is safe.

Leaving these unset (e.g. on `staging`, which has none of this
provisioned) is a deliberate no-op — `deploy.yml` only adds
`--add-cloudsql-instances`/`--set-secrets` when `CLOUDSQL_CONNECTION_NAME`
is actually set. `app/integrations/pulseem.py` and `resend_email.py` also
independently log a warning and skip sending rather than failing the
request if their key isn't reachable for any reason.

Reuses the same Pulseem/Resend accounts the Base44 app already had (same
sender number `0508085672`, same `noreply@daawatey.com` domain) — no new
third-party accounts needed, just the existing API keys.

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

## Running a migration

Repo → **Actions** tab → **Run DB Migration** workflow → **Run workflow** →
choose `staging` or `prod` → **Run workflow**. Runs `alembic upgrade head`
in CI against Cloud SQL, the same auth as a deploy — no local Cloud SQL
Auth Proxy or venv needed (see `migrations/README.md` for the local
fallback). Still entirely manual, same standing rule as before: nothing
runs automatically on deploy. **Run this before the corresponding backend
deploy whenever a migration is pending** — deploying backend code that
references a column the DB doesn't have yet breaks every request that
touches it.

### One-time setup for the migration workflow

It reuses `DEPLOY_SA_EMAIL`/`WIF_PROVIDER`/`CLOUDSQL_CONNECTION_NAME` from
the table above — nothing new to add to GitHub. It just needs two more IAM
grants on the deploy service account, once per environment, so it can
reach Cloud SQL and read the same `DATABASE_URL` secret Cloud Run itself
reads (never duplicated into a separate GitHub secret):

```bash
# prod
gcloud projects add-iam-policy-binding daawatey-prod \
  --member="serviceAccount:github-deployer@daawatey-prod.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud secrets add-iam-policy-binding database-url \
  --project=daawatey-prod \
  --member="serviceAccount:github-deployer@daawatey-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# staging — its deployer SA needs the grant in daawatey-prod (that's where
# the instance and both DATABASE_URL secrets actually live), same
# cross-project pattern as backend-runtime@daawatey-staging in
# BUSINESS_LOGIC.md
gcloud projects add-iam-policy-binding daawatey-prod \
  --member="serviceAccount:github-deployer@daawatey-staging.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud secrets add-iam-policy-binding database-url-staging \
  --project=daawatey-prod \
  --member="serviceAccount:github-deployer@daawatey-staging.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```
