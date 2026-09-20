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
