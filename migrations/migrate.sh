#!/usr/bin/env bash
# One-shot local migration runner: downloads/validates the Cloud SQL Auth
# Proxy, sets up the venv, starts the proxy, waits for it to actually be
# listening, runs alembic, then tears the proxy down — the whole manual
# dance from migrations/README.md in a single command.
#
# Usage:
#   export DB_PASSWORD=...        # daawatey_app's password (prod) or
#                                  # daawatey_staging_app's (staging)
#   ./migrate.sh [prod|staging]   # defaults to prod
set -euo pipefail
cd "$(dirname "$0")"

ENVIRONMENT="${1:-prod}"
if [ "$ENVIRONMENT" = "staging" ]; then
  DB_USER="daawatey_staging_app"
  DB_NAME="daawatey_staging"
elif [ "$ENVIRONMENT" = "prod" ]; then
  DB_USER="daawatey_app"
  DB_NAME="daawatey"
else
  echo "Unknown environment '$ENVIRONMENT' — expected 'prod' or 'staging'." >&2
  exit 1
fi

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "DB_PASSWORD is not set. Run: export DB_PASSWORD=... first." >&2
  exit 1
fi

# Re-download if missing or suspiciously small — a bad URL once downloaded a
# GCS XML error page in place of the real ~20MB binary, and `chmod +x` on
# that doesn't fail, only running it does, so file *size* is the check that
# actually catches it.
if [ ! -f cloud-sql-proxy ] || [ "$(wc -c < cloud-sql-proxy)" -lt 5000000 ]; then
  echo "Fetching cloud-sql-proxy..."
  curl -sSL -o cloud-sql-proxy \
    https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
  chmod +x cloud-sql-proxy
fi

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

# 5433, not 5432 — a local Postgres install (common on dev machines) often
# already owns 5432, and the Auth Proxy failing to bind while something
# else answers on the same port is worse than a clean failure: the
# readiness probe below can't tell "the proxy is up" from "some unrelated
# service is up", so alembic would silently run against the wrong database.
PROXY_PORT=5433

# Fail fast, with a clear message, if even 5433 is somehow taken —
# better than repeating the "connected to the wrong thing" failure mode
# this port choice exists to avoid.
if (exec 3<>/dev/tcp/127.0.0.1/$PROXY_PORT) 2>/dev/null; then
  exec 3<&- 3>&-
  echo "Something is already listening on 127.0.0.1:$PROXY_PORT — refusing to reuse it. Free that port or edit PROXY_PORT in this script." >&2
  exit 1
fi

./cloud-sql-proxy daawatey-prod:us-central1:daawatey-db --port "$PROXY_PORT" &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT

echo "Waiting for the Auth Proxy to start listening..."
for _ in $(seq 1 20); do
  if (exec 3<>/dev/tcp/127.0.0.1/$PROXY_PORT) 2>/dev/null; then
    exec 3<&- 3>&-
    break
  fi
  # The proxy process died (e.g. failed to bind) — no point waiting out
  # the full timeout for a process that's already gone.
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Auth Proxy process exited early — check its output above." >&2
    exit 1
  fi
  sleep 1
done
if ! (exec 3<>/dev/tcp/127.0.0.1/$PROXY_PORT) 2>/dev/null; then
  echo "Auth Proxy never started listening on 127.0.0.1:$PROXY_PORT — check its output above." >&2
  exit 1
fi
exec 3<&- 3>&- 2>/dev/null || true

export DATABASE_URL="postgresql+psycopg://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PROXY_PORT}/${DB_NAME}"
echo "Running migrations against $ENVIRONMENT ($DB_NAME)..."
alembic upgrade head
echo
echo "Now at:"
alembic current
