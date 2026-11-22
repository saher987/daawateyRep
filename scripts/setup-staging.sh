#!/usr/bin/env bash
# One-time (and safe to re-run) GCP setup that brings daawatey-staging up to
# what prod has, so a Deploy to staging behaves like prod (DEPLOYMENT.md,
# "Staging"). Run it in Cloud Shell as the project owner:
#
#   bash scripts/setup-staging.sh              # IAM grants only
#   bash scripts/setup-staging.sh --with-keys  # also copy prod's Pulseem/
#                                              # Resend/WhatsApp keys into
#                                              # *-staging secrets
#
# Only add --with-keys once TEST_RECIPIENTS is set on the staging GitHub
# environment: deploy.yml mounts the SMS/email keys on staging only then,
# and the backend then sends only to those numbers/emails.
#
# Nothing here touches prod's own grants, secrets or database.
set -euo pipefail

PROD=daawatey-prod
STAGING=daawatey-staging
RUNTIME_SA="backend-runtime@${STAGING}.iam.gserviceaccount.com"
DEPLOY_SA="github-deployer@${STAGING}.iam.gserviceaccount.com"
BUCKET="gs://${STAGING}.firebasestorage.app"

WITH_KEYS=false
[ "${1:-}" = "--with-keys" ] && WITH_KEYS=true

step() { printf '\n== %s\n' "$*"; }

grant_secret() { # secret name in daawatey-prod, member
  gcloud secrets add-iam-policy-binding "$1" --project="$PROD" \
    --member="serviceAccount:$2" --role=roles/secretmanager.secretAccessor \
    --condition=None --quiet >/dev/null
}

step "Cloud SQL: staging backend + deployer reach the shared instance in $PROD"
for sa in "$RUNTIME_SA" "$DEPLOY_SA"; do
  gcloud projects add-iam-policy-binding "$PROD" --member="serviceAccount:$sa" \
    --role=roles/cloudsql.client --condition=None --quiet >/dev/null
done
grant_secret database-url-staging "$RUNTIME_SA"
grant_secret database-url-staging "$DEPLOY_SA"   # migrate.yml reads it

step "Phone-OTP login: runtime SA may sign custom tokens as itself (BUSINESS_LOGIC.md §2a)"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$STAGING" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/iam.serviceAccountTokenCreator \
  --quiet >/dev/null

step "Push notifications: FCM send (BUSINESS_LOGIC.md §2b)"
gcloud projects add-iam-policy-binding "$STAGING" --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/firebasecloudmessaging.admin --condition=None --quiet >/dev/null

step "Uploads: write + public read on $BUCKET (BUSINESS_LOGIC.md §6)"
if gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets add-iam-policy-binding "$BUCKET" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectAdmin >/dev/null
  gcloud storage buckets add-iam-policy-binding "$BUCKET" \
    --member=allUsers --role=roles/storage.objectViewer >/dev/null
else
  echo "!! $BUCKET doesn't exist yet. Firebase Console → $STAGING → Build → Storage →"
  echo "   Get started, then re-run this script."
fi

if $WITH_KEYS; then
  step "Sending keys: copy prod's values into *-staging secrets (same accounts)"
  for name in pulseem-api-key resend-api-key whatsapp-token whatsapp-app-secret; do
    if ! gcloud secrets describe "$name" --project="$PROD" >/dev/null 2>&1; then
      echo "   $name: not in prod, skipped"
      continue
    fi
    if gcloud secrets describe "$name-staging" --project="$PROD" >/dev/null 2>&1; then
      echo "   $name-staging: already exists, kept"
    else
      gcloud secrets versions access latest --secret="$name" --project="$PROD" |
        gcloud secrets create "$name-staging" --project="$PROD" --data-file=- >/dev/null
      echo "   $name-staging: created"
    fi
    grant_secret "$name-staging" "$RUNTIME_SA"
  done
fi

step "Done. Next: check the staging GitHub environment's secrets (DEPLOYMENT.md, Staging), then Run DB Migration → staging, then Deploy → staging."
