# Backlog

Deferred work — not urgent, tracked here so it doesn't get lost.

## Mobile / Release

- [x] **Android — live in production.** Run #22's versionCode (22) had
  already been used by an earlier upload, so run #23 (2026-09-10, commit
  `75f6314`, https://github.com/saher987/daawateyRep/actions/runs/34496040582,
  versionCode 23) supplied the actual AAB with the real icon. Uploaded to
  the "Daawatey prod1" production release in Play Console, submitted
  (2026-09-10), and approved — app is now live in production on Google Play.

- [x] **iOS — resubmitted, awaiting Apple review.** The icon-fix build
  (22) was rejected under Guideline 2.1.0 App Completeness: two crash
  logs both showed `NSCameraUsageDescription`/TCC terminating the app
  the moment the reviewer tapped "Take Photo" on the avatar picker in
  `Profile.jsx` (a plain `<input type="file">` triggers iOS's native
  file-upload sheet in Capacitor's WKWebView, which still enforces
  camera/photo-library usage-description keys even though it's not a
  native Camera-plugin call). Fixed in commit `a801585` (added
  `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` to
  `Info.plist`), built as run #23
  (https://github.com/saher987/daawateyRep/actions/runs/34608890822,
  2026-09-11). Build 23 selected in App Store Connect and resubmitted to
  App Review (2026-09-11/14) — waiting on Apple's decision.

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
  - **Native builds.** iOS/Android still bundle the old Google/Apple-only
    flow until a new native build ships each. Hold off on iOS specifically
    until the pending App Review (above) clears — don't want two changes
    in flight on one submission.
  - **Staging IAM grant.** `backend-runtime@daawatey-staging` needs the
    same `iam.serviceAccountTokenCreator` grant the first time this code
    path is actually exercised there (not yet done — see BUSINESS_LOGIC.md §2a).
  - **SMS Retriever API (native Android, true silent auto-read).** WebOTP
    likely doesn't work inside the native app's WebView (its origin isn't
    really `https://daawatey.com`) — deferred, needs a native Capacitor
    plugin and an app-signing-hash-in-every-SMS setup that gets
    complicated once Play App Signing re-signs the app.
