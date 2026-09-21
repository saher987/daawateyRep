# Backlog

Deferred work — not urgent, tracked here so it doesn't get lost.

## Mobile / Release

- [x] **Android — build 27 (phone-OTP, push notifications, required-profile
  enforcement) submitted for Production rollout.** Build
  (https://github.com/saher987/daawateyRep/actions/runs/35426187013,
  commit `e802865`) uploaded to Play Console 2026-09-20, passed automated
  pre-review checks, now in Google's review queue. Android already has the
  full phone-OTP/push feature set live once this clears.

- [ ] **iOS — build 23 (camera-crash fix only) resubmitted, awaiting
  Apple review.** The icon-fix build (22) was rejected under Guideline
  2.1.0 App Completeness: two crash logs both showed
  `NSCameraUsageDescription`/TCC terminating the app the moment the
  reviewer tapped "Take Photo" on the avatar picker in `Profile.jsx` (a
  plain `<input type="file">` triggers iOS's native file-upload sheet in
  Capacitor's WKWebView, which still enforces camera/photo-library
  usage-description keys even though it's not a native Camera-plugin
  call). Fixed in commit `a801585` (added `NSCameraUsageDescription` +
  `NSPhotoLibraryUsageDescription` to `Info.plist`), built as run #23
  (https://github.com/saher987/daawateyRep/actions/runs/34608890822,
  2026-09-11). This build predates phone-OTP/push — resubmitted as-is
  (2026-09-20) to get *something* approved and unblock the app listing
  first, rather than risk a second rejection on a bigger diff.

  **Deliberate product decision (2026-09-20): don't touch iOS again until
  this build is approved.** Once Apple approves build 23, do the iOS
  native work in one batch:
  - Phone-OTP as the primary/only visible login on iOS (mirrors what's
    already live on web/Android): wire `PhoneOtpLogin.jsx` into the native
    shell, iOS Universal Links (`apple-app-site-association` +
    Associated Domains capability + provisioning profile regeneration —
    same capability/profile dance as the Sign In with Apple and Game
    Center entitlements earlier) for the "more details" deep-link flow,
    and native push (APNs Auth Key generated in Apple Developer portal →
    uploaded to Firebase Console Cloud Messaging tab, Push Notifications
    capability + another provisioning profile regeneration, then unset
    the `Capacitor.getPlatform() !== 'android'` early-return in
    `frontend/src/lib/push.js`).
  - Ship that as its own build/submission, not bundled into build 23's
    fix — avoids two unrelated changes in flight on one Apple review, the
    same reasoning that already held this work back once.

## Auth

- [x] **Phone OTP as the primary login — live on web, confirmed working
  end-to-end.** See commits `03c7529`/`89ff8e4`. Deployed to prod
  (`deploy.yml` runs #45/#46), hit a real bug on first live test —
  `create_custom_token()` failing with `TokenSignError` (missing
  `iam.serviceAccountTokenCreator` self-impersonation grant on
  `backend-runtime@daawatey-prod`) — fixed via a one-time `gcloud`
  IAM grant (documented in BUSINESS_LOGIC.md §2a), no redeploy needed.
  User confirmed the full phone → SMS → code → signed-in flow works.
- [x] **users.phone made unique; deactivate now clears it; WebOTP/one-time-code
  added.** A real duplicate (two accounts, same phone, one later
  admin-disabled) surfaced a matching bug — OTP login could sign into the
  disabled account. Fixed app-side (commit `606d52c`, `is_active` filter
  on the phone lookup), then closed properly at the data layer (commit
  `10d54c1`): `migrations/versions/0005_user_phone_unique.py` (applied to
  prod 2026-09-17 — ran cleanly, no active-vs-active collisions existed),
  `users.py`'s deactivate now nulls `phone` so a disabled account can
  never block a number again, and the three call sites that write `phone`
  (auth.py's lazy creation, otp.py's new-account path, `PUT /api/profile`)
  all handle the constraint gracefully instead of crashing on it. Also
  added WebOTP (Chrome/Android auto-fill + auto-submit from the SMS) and
  `autocomplete="one-time-code"` (iOS QuickType) to `PhoneOtpLogin.jsx`.

  Still open:
  - **iOS native build.** Android's phone-OTP/push build (27) is already
    in Play Console review (see Mobile/Release above). iOS still bundles
    the old Google/Apple-only flow — deliberately held off until build 23
    (camera-crash fix only) clears Apple review; see the detailed plan
    under Mobile/Release above.
  - **Staging IAM grant.** `backend-runtime@daawatey-staging` needs the
    same `iam.serviceAccountTokenCreator` grant the first time this code
    path is actually exercised there (not yet done — see BUSINESS_LOGIC.md §2a).
  - **SMS Retriever API (native Android, true silent auto-read).** WebOTP
    likely doesn't work inside the native app's WebView (its origin isn't
    really `https://daawatey.com`) — deferred, needs a native Capacitor
    plugin and an app-signing-hash-in-every-SMS setup that gets
    complicated once Play App Signing re-signs the app.

## Push notifications

- [x] **Real push (Android) — confirmed working end-to-end 2026-09-21.**
  Live test (adding self as invitee) surfaced two real, separate bugs,
  both fixed:
  - `add_recipient`'s phone→account linking used an exact string match
    (`models.User.phone == body.phone`); a format mismatch (e.g. "05..."
    vs "+972 5...") silently failed to link the recipient to their real
    account, so `send_push_to_user` never had a `linked_user` to push to
    at all — the in-app notification still worked (separate email-based
    fallback), masking the push failure. Fixed by extracting otp.py's
    existing tolerant `_find_by_phone` into a shared `find_by_phone()` in
    `pulseem.py` and using it in `add_recipient` too (commit `6a59403`).
  - `backend-runtime@daawatey-prod` had no Cloud Messaging IAM role at
    all — every FCM send was rejected with `cloudmessaging.messages.create
    denied`, caught and logged by design (never surfaced to the client),
    invisible until per-token send-outcome logging was added to
    `send_push_to_user` (commit `9fb8e49`) made it diagnosable. Fixed via
    `gcloud projects add-iam-policy-binding ... --role=roles/firebasecloudmessaging.admin`
    (documented in BUSINESS_LOGIC.md §2b), no redeploy needed.

  Still open:
  - **Staging IAM grant.** `backend-runtime@daawatey-staging` needs the
    same `roles/firebasecloudmessaging.admin` grant the first time push is
    actually exercised there (not yet done — see BUSINESS_LOGIC.md §2b).
  - **iOS push.** Deferred along with iOS phone-OTP/Universal Links — see
    Mobile/Release above.

## Infra

- [ ] **Apex domain (`daawatey.com`, no `www`) — DNS fixed, cert still
  provisioning as of 2026-09-21.** Was IONOS domain-forwarding (no real
  DNS records, no valid TLS cert for the apex → `ERR_SSL_PROTOCOL_ERROR`).
  Fixed: created a Cloud Run domain mapping for `daawatey.com` →
  `daawatey-frontend`, replaced IONOS's forwarding-owned `A`/`AAAA`/TXT
  records with the 4 `A` + 4 `AAAA` records Google's domain mapping
  provided. `DomainRoutable: True` confirmed; Google's managed-cert
  issuance (`CertificatePending`) was still in progress as of this
  writing — check with
  `gcloud beta run domain-mappings describe --domain=daawatey.com --region=us-central1 --project=daawatey-prod`
  and look for `Ready: True`. Also had to add `https://daawatey.com`
  to the `ALLOWED_ORIGINS` GitHub secret (prod environment) — CORS only
  allowed `www.` before, causing a "Failed to fetch" on every API call
  from the bare apex.
