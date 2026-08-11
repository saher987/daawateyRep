# Business logic rebuild — Base44 parity plan

Target: rebuild the Base44 app's actual functionality (entities, roles, pages,
flows) on top of the infra already working (Firebase Auth + FastAPI + Cloud
Run). Login/identity adapts to our infra; everything else aims to match
Base44's behavior. **Scoped to the `daawatey-prod` project only for now** —
staging is not touched by this phase. Web first, Android second (the
Android shell already works and gets the new pages for free once the web
app has them, via Capacitor sync).

Source: the uploaded Base44 spec (`DAAWATEYMD_1.odt`) — full extracted text
is not committed here since it's the user's own document, but every decision
below traces back to a specific section of it.

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

## Schema (all entities from spec §4)

| Table | Notes |
|---|---|
| `users` | `firebase_uid` (unique), `email`, `role`, `first_name`, `last_name`, `town`, `phone`, `preferred_language`, timestamps |
| `pending_invites` | `email`, `role`, `invited_by_uid`, `consumed_at` |
| `events` | `title`, `type`, `date`, `venue_id` (FK, nullable), `couple_names`, `host`, `cover_image_url`, `invitation_image_url`, `greeting`, `status` (draft/active/completed/cancelled), `owner_emails[]`, `manager_emails[]` |
| `invitation_recipients` | `event_id` FK, `event_creator_id`, `user_id` FK nullable, name parts, `phone`, `email`, `personal_token` (unique), `status`, `opened_at`, `rsvp_status`, `rsvp_guests_count`, `rsvp_message` |
| `venues` | `name`, `city`, `address`, `max_guests`, `map_url`, `phone`, `image_url`, `notes`, `owner_emails[]` |
| `planned_weddings` | `owner_name`, `phone`, `date`, `city` |
| `event_requests` | `title`, `details`, `requester_name`, `requester_phone`, `requester_email`, `status` (pending/approved/rejected) |
| `notifications` | `type`, `title`, `message`, `target_user_email`, `is_read` |
| `otp_verifications` | `phone`, `code`, `expires_at`, `is_used` |

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

## Infra you need to provision (prod only)

Not run yet by me — these are for you to run when you're ready to actually
point `daawatey-prod` at a real database. All commands target
`daawatey-prod` only, per "let's focus only in the prod project from now."

### 1. Create the Cloud SQL instance + database + user

The smallest/cheapest tier that still works for a real (if early-stage) app.
Pick a strong password yourself for `DB_PASSWORD` — don't reuse anything.

```bash
gcloud sql instances create daawatey-db \
  --project=daawatey-prod \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --no-assign-ip \
  --network=default

gcloud sql databases create daawatey --instance=daawatey-db --project=daawatey-prod

gcloud sql users create daawatey_app \
  --instance=daawatey-db \
  --project=daawatey-prod \
  --password="$DB_PASSWORD"
```

`--no-assign-ip` skips a public IP entirely — only reachable via the Cloud
SQL Auth Proxy / Cloud Run's built-in connector, which is what step 2 uses.

### 2. Let Cloud Run connect to it

Get the instance connection name (format `PROJECT:REGION:INSTANCE`):

```bash
gcloud sql instances describe daawatey-db --project=daawatey-prod \
  --format="value(connectionName)"
```

Then redeploy the backend with `--add-cloudsql-instances` and a
`DATABASE_URL` pointed at the Unix socket that flag makes available (this
becomes a new line in `deploy.yml`'s backend deploy step, added once this
phase's code is ready to actually run against it — not done yet):

```bash
gcloud run services update daawatey-backend \
  --project=daawatey-prod \
  --region=us-central1 \
  --add-cloudsql-instances=<CONNECTION_NAME> \
  --set-env-vars="DATABASE_URL=postgresql+psycopg://daawatey_app:${DB_PASSWORD}@/daawatey?host=/cloudsql/<CONNECTION_NAME>"
```

### 3. Run the migration once, from your machine, via the proxy

```bash
# Auth Proxy — download once: https://cloud.google.com/sql/docs/postgres/sql-proxy
./cloud-sql-proxy <CONNECTION_NAME> --port 5432 &

cd migrations
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://daawatey_app:${DB_PASSWORD}@127.0.0.1:5432/daawatey"
alembic upgrade head
```

### 4. GitHub secret

Add `DATABASE_URL` (the Unix-socket form from step 2, not the proxy form
from step 3) to the `prod` GitHub Environment, then wire it into
`deploy.yml`'s backend deploy step alongside `--add-cloudsql-instances` —
this is a follow-up commit once the app is actually ready to be pointed at
the real instance instead of local dev.
