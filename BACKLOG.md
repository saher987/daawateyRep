# Backlog

Deferred work — not urgent, tracked here so it doesn't get lost.

## Mobile / Release

- [ ] **Android release build with the new app icon.** iOS got the real
  gold-envelope icon (fixing Apple's Guideline 2.3.8 placeholder-icon
  rejection) via `ios-release-build.yml`. The same icon assets were already
  generated and committed for Android (`frontend/android/app/src/main/res/
  mipmap-*/ic_launcher*.png`, adaptive-icon background color) in the same
  commit — they just haven't been built/shipped yet. Trigger
  `.github/workflows/android-release-build.yml` (`workflow_dispatch`) on
  `claude/base44-gcp-migration-wuv790` when ready, verify the build, and
  continue Android's closed-testing rollout with the corrected icon.
