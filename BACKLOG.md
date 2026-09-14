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
