# Business logic rebuild — Base44 parity plan

Target: rebuild the Base44 app's actual functionality (entities, roles, pages,
flows) on top of the infra already working (Firebase Auth + FastAPI + Cloud
Run). Login/identity adapts to our infra; everything else aims to match
Base44's behavior. **Scoped to the `daawatey-prod` project only for now** —
staging is not touched by this phase. Web first, Android second (the
Android shell already works and gets the new pages for free once the web
app has them, via Capacitor sync).

Source: originally the uploaded Base44 spec (`DAAWATEYMD_1.odt`); **superseded
by the actual Base44 app source** (`github.com/saher987/zaffaf`) once it
became available — the schema below is taken directly from
`base44/entities/*.jsonc` and the backend functions from
`base44/functions/*/entry.ts` in that repo, not guessed from prose. The
frontend port (pages, components, routing, i18n) is also being done directly
from that repo's `src/`, not rebuilt from scratch — see "Frontend port" below.

## Database decision — resolved: Postgres (Cloud SQL)

`ARCHITECTURE.md` previously deferred this. Resolving it now because the
spec's own entities are inherently relational:

- `Event.owner_emails[]` / `manager_emails[]`, `Venue.owner_emails[]` — arrays
  Postgres handles natively.
- `InvitationRecipient.event_id` → `Event`, `.user_id` → `User` — real
  foreign keys, joined constantly (recipient lists, RSVP stats, CSV export).
- RSVP counts (Flow D: "total/accepted/declined/pending") are aggregate
  queries — trivial in SQL, awkward in Firestore.
- OTP verify-and-link (Flow G) needs an atomic read-check-write across two
  rows (`OtpVerification` + `InvitationRecipient`) — a transaction, not a
  batched write.

So: **Cloud SQL for PostgreSQL**, one instance in `daawatey-prod`, connected
from Cloud Run via the Cloud SQL Auth Proxy (Unix socket), which is the
standard no-public-IP way to reach it. Migrations are SQL files run manually
via Alembic, living in `/migrations` — **never auto-applied on deploy**, per
the standing rule; you run `alembic upgrade head` yourself against Cloud SQL
(via the proxy) whenever you're ready to apply one.

## Identity & roles — how Base44's model maps onto Firebase Auth

Base44's `User` entity was built-in to the platform (roles, invite-by-email,
`base44.auth.updateMe`). We don't have that platform, so:

- **Firebase Auth** still only proves *who* someone is (uid, email) — nothing
  about role or profile. That never changes; the backend never trusts a
  client-asserted role.
- A new Postgres `users` table is keyed by `firebase_uid`, carries
  `role` (`admin` / `manager` / `venue_owner` / `user`), profile fields
  (`first_name`, `last_name`, `town`, `phone`, `preferred_language`), and is
  the single source of truth for role from here on.
- **Replacing `base44.users.inviteUser(email, role)`**: there's no platform
  method to call, so a `pending_invites` table holds `(email, role)` rows
  created by an admin/manager. On first Firebase sign-in, the backend looks
  up the signed-in email in `pending_invites`; if found, the new `users` row
  gets that role and the invite is marked consumed; if not found, the role
  defaults to `user` (a normal guest/event-owner signing up on their own —
  Flow C/B's entry point). Nobody can grant themselves `admin`.
- **Profile completion enforcement** (spec §2, Flow G): `GET /api/me` now
  returns `role` and `profile_complete`; the frontend's `AppLayout` redirects
  to `/profile` exactly like Base44 did, just driven by our own field instead
  of a Base44 built-in check.

## Schema (all entities, matching `base44/entities/*.jsonc` field-for-field)

| Table | Notes |
|---|---|
| `users` | `firebase_uid` (unique), `email`, `role`, `first_name`, `last_name`, `nickname`, `town`, `phone`, `preferred_language`, `last_login`, `photo_url`, timestamps |
| `pending_invites` | `email`, `role`, `invited_by_uid`, `consumed_at` — **no Base44 equivalent**, this app's own replacement for `inviteUser` |
| `events` | `title`/`title_ar`, `event_type` enum, `date`, inline `venue_name`/`venue_city`/`venue_address`/`venue_map_url` **plus** optional `venue_id` FK, `description`/`description_ar`, `invitation_greeting`/`invitation_greeting_he`, `cover_image_url`, `invitation_image_url`, `groom_name`, `bride_name`, `host_name`, `host_phone`, `status`, `max_guests`, `theme_color`, `owner_email` (legacy singular, display only), `owner_emails[]`, `manager_emails[]` |
| `invitation_recipients` | `event_id` FK, `event_creator_id`, `user_id` FK nullable, `external_full_name`, `nickname`, name parts, `phone`, `email`, `personal_token` (unique), `status` enum, `first_opened_at`/`last_opened_at`/`open_count`, `phone_verified`/`verified_phone`, `rsvp_status` enum (incl. `maybe`), `rsvp_guests_count`, `rsvp_message`, `rsvp_date`, `guests_count`, `group_label`, `notes` |
| `venues` | `name`, `city`, `address`, `max_guests`, `map_url`, `phone`, `image_url`, `notes`, `owner_emails[]` |
| `planned_weddings` | `owner_name`, `phone`, `date`, `city` |
| `event_requests` | `title`, `details`, `requester_name`, `requester_phone`, `requester_email`, `requester_uid` (addition), `status` enum (incl. `in_review`), `admin_notes` |
| `notifications` | `event_id` FK, `recipient_id` FK, `type` enum, `title`, `message`, `target_user_email`, `is_read` |
| `otp_verifications` | `phone`, `otp_code`, `expires_at`, `is_used` |

### Deliberate deviations from the original schema

- **Dropped as dead legacy columns** on `invitation_recipients`: `full_name`,
  `invitation_token`, `invitation_status`, `sent_date`, `opened_date`. The
  original's own entity file marks these "Legacy" — each was already
  superseded by a newer parallel field (`external_full_name`,
  `personal_token`, `status`, `first_opened_at`/`last_opened_at`). No reason
  to carry Base44's own migration debt into a fresh app.
- **OTP is actually sent via SMS here.** The original's `sendOtp` function
  never sent an SMS at all — it generated the code, stored it, and returned
  it directly in the API response (`otp_preview`) with a comment saying
  "for demo/MVP". That's a real security gap (anyone who can call the
  endpoint gets the code without ever touching the phone), not something to
  preserve. This app sends it through the same Pulseem integration already
  used for invitation SMS (Phase 6).

## API surface — phased

**Phase 0 (this commit)**: schema + Alembic migration for all tables above.

**Phase 1 (this commit)**: `users`/`pending_invites` wired into auth —
`get_app_user` dependency, extended `/api/me`, `PUT /api/profile`.

**Phase 2 (this commit)**: Events + Invitation Recipients — the backbone of
Flow A/D: create event, list/get, add recipients (personal token generated
server-side), activate (draft → active), list-mine (`owner_emails` /
`manager_emails` match), RSVP stats.

**Phase 3 (next)**: Public invitation flow (Flow B) — `getInvitationByToken`
as `GET /api/invitations/{token}` (no auth), `submitRsvp`, OTP
send/verify/link (Flow G's guest side).

**Phase 4 (next)**: Venues + Planned Weddings + Venue Schedule (Flow E).

**Phase 5 (next)**: Event Requests (Flow C) + Notifications (Flow F).

**Phase 6 (next)**: Pulseem SMS + Resend email integrations (spec §6),
wired into `sendInvitationSms` / `notifyEventUpdate` / `sendSupportEmail`.

**Phase 7 (next)**: Frontend pages/routes/RTL i18n mirroring the Base44
route table (spec §3, §8, §9) — this is the bulk of the visible work, done
once the API underneath it is stable.

## Role permissions (spec §1, encoded server-side)

| Action | admin | manager | venue_owner | user |
|---|---|---|---|---|
| View all events/invitees/requests | ✅ | ✅ | ❌ | ❌ (only own) |
| Create/edit events | ✅ | ✅ | ❌ | ❌ |
| Delete venues / planned weddings | ✅ | ❌ | ❌ | ❌ |
| Invite users, change roles | ✅ | ❌ | ❌ | ❌ |
| View/manage own venues + their schedule | ✅ | ✅ | ✅ (own only) | ❌ |
| Request an event, manage own event as owner | ✅ | ✅ | ❌ | ✅ |

Enforced via a `require_role(*roles)` FastAPI dependency, and per-row checks
(`owner_emails`/`manager_emails` membership) inside route handlers where the
table above says "own only".

## Frontend port

`zaffaf/src` is a full, working React app (Tailwind + Radix/shadcn UI
primitives + react-router-dom + @tanstack/react-query + react-hook-form +
zod + lucide-react + a 986-line `i18n.jsx` with Arabic/Hebrew/English and
RTL support) — 24 pages, ~50 UI components. Porting it directly rather than
rebuilding from scratch: adopt the same dependency stack into `frontend/`,
port `AuthContext` to wrap Firebase Auth + this backend's `/api/me` instead
of `base44.auth.me()`, and port pages in order matching backend readiness
(events/invitees/RSVP first since that backend exists; venues/event
requests/notifications/OTP once their backend lands too). Every
`base44.entities.X.create/filter/update` and `base44.functions.Y()` call in
a ported page becomes a `fetch` against this backend's REST API.

## Infra provisioned in `daawatey-prod` (done — this is what actually happened)

All commands below were actually run against `daawatey-prod`, in this
order, including the real problems hit along the way — kept here so the
next environment (or a rebuild) doesn't repeat the same debugging.

### 1. Cloud SQL instance + database + user

```bash
export DB_PASSWORD='...'   # pick a strong one, keep it somewhere safe

gcloud sql instances create daawatey-db \
  --project=daawatey-prod \
  --database-version=POSTGRES_16 \
  --edition=ENTERPRISE \
  --tier=db-f1-micro \
  --region=us-central1 \
  --no-assign-ip \
  --network=default
```

Two gotchas hit creating this, both one-time project-level setup:

- `--edition=ENTERPRISE` is required — Cloud SQL now defaults new instances
  to "Enterprise Plus," which doesn't support shared-core tiers like
  `db-f1-micro` at all.
- `--no-assign-ip` needs **Private Services Access** configured on the
  project's VPC first, or instance creation fails with
  `SERVICE_NETWORKING_NOT_ENABLED`:
  ```bash
  gcloud services enable servicenetworking.googleapis.com --project=daawatey-prod
  gcloud compute addresses create google-managed-services-default \
    --global --purpose=VPC_PEERING --prefix-length=16 \
    --network=default --project=daawatey-prod
  gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges=google-managed-services-default \
    --network=default --project=daawatey-prod
  ```

Then the database and app user:

```bash
gcloud sql databases create daawatey --instance=daawatey-db --project=daawatey-prod

gcloud sql users create daawatey_app \
  --instance=daawatey-db --project=daawatey-prod --password="$DB_PASSWORD"
```

**Private IP turned out not to work for this setup** — a private IP is
only reachable from *inside* the GCP VPC, and neither a developer's laptop
nor (without a Serverless VPC Access connector, not set up here) Cloud Run
itself are inside it by default. Rather than add that extra piece of
networking infra, we added a public IP to the same instance — the Cloud
SQL Auth Proxy (used by both Cloud Run and local migration access) still
requires an authenticated GCP identity to connect through it regardless,
so this isn't the security regression it sounds like:

```bash
gcloud sql instances patch daawatey-db --project=daawatey-prod --assign-ip
```

### 2. Cloud Run → Cloud SQL: the IAM permission that's easy to miss

Get the connection name once assign-ip has finished:

```bash
gcloud sql instances describe daawatey-db --project=daawatey-prod \
  --format="value(connectionName)"
# daawatey-prod:us-central1:daawatey-db
```

`--add-cloudsql-instances` in `deploy.yml` (see below) lets Cloud Run *ask*
to connect, but the backend's runtime service account also needs the IAM
role to actually be allowed to — without this, every DB-touching request
fails at runtime with `403 NOT_AUTHORIZED ... missing permission
cloudsql.instances.get`, which surfaces to the browser as a misleading CORS
error (a 500 with no CORS headers reads as "CORS blocked", not "the server
crashed"):

```bash
gcloud projects add-iam-policy-binding daawatey-prod \
  --member="serviceAccount:backend-runtime@daawatey-prod.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### 3. Secrets: Google Secret Manager, not GitHub

`DATABASE_URL`, `PULSEEM_API_KEY`, and `RESEND_API_KEY` live in Secret
Manager — `--set-secrets` passes Cloud Run only the *secret name*, and the
value is injected into the container at startup, never appearing in the
service config or a deploy's audit log (unlike `--set-env-vars`, which is
exactly how the DB password once showed up in plaintext in an audit log
while debugging the IAM issue above).

```bash
gcloud services enable secretmanager.googleapis.com --project=daawatey-prod

printf '%s' "postgresql+psycopg://daawatey_app:${DB_PASSWORD}@/daawatey?host=/cloudsql/daawatey-prod:us-central1:daawatey-db" | \
  gcloud secrets create database-url --project=daawatey-prod --data-file=- --replication-policy=automatic

printf '%s' "$PULSEEM_API_KEY" | \
  gcloud secrets create pulseem-api-key --project=daawatey-prod --data-file=- --replication-policy=automatic

printf '%s' "$RESEND_API_KEY" | \
  gcloud secrets create resend-api-key --project=daawatey-prod --data-file=- --replication-policy=automatic

for SECRET in database-url pulseem-api-key resend-api-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --project=daawatey-prod \
    --member="serviceAccount:backend-runtime@daawatey-prod.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

`deploy.yml`'s backend deploy step references these by name via
`--set-secrets=DATABASE_URL=database-url:latest,...` — see DEPLOYMENT.md
for the (non-sensitive) GitHub secrets that gate this.

### 4. Run the migration once, from your machine, via the Auth Proxy

```bash
# download once: https://cloud.google.com/sql/docs/postgres/sql-proxy
./cloud-sql-proxy daawatey-prod:us-central1:daawatey-db --port 5432 &

cd migrations
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://daawatey_app:${DB_PASSWORD}@127.0.0.1:5432/daawatey"
alembic upgrade head
```

If the Auth Proxy itself fails with a credentials error, it needs its own
one-time login, separate from `gcloud auth login`:
`gcloud auth application-default login`.

### 5. To rotate the DB password later

```bash
gcloud sql users set-password daawatey_app --instance=daawatey-db \
  --project=daawatey-prod --password="$NEW_PASSWORD"
printf '%s' "postgresql+psycopg://daawatey_app:${NEW_PASSWORD}@/daawatey?host=/cloudsql/daawatey-prod:us-central1:daawatey-db" | \
  gcloud secrets versions add database-url --project=daawatey-prod --data-file=-
```

The IAM permission grant in step 2 took effect immediately with no
redeploy (confirmed — that's an access check made at connection time, not
something baked into the container). A **rotated secret value is
different**: Cloud Run resolves `:latest` once, at each container
instance's startup, and keeps that value for the instance's life — so
after `gcloud secrets versions add`, re-run the Deploy workflow (every run
creates a fresh revision even against an unchanged image) if you need the
new value live immediately, rather than waiting for natural autoscaling
churn to eventually replace existing instances.
