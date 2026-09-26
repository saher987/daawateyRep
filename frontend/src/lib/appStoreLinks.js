// Shared by InstallAppBanner.jsx (dismissible nudge for organic web
// visitors) and GetApp.jsx (the instant-redirect landing page for QR
// codes printed on physical materials — see that file's own docstring
// for why a redirect exists instead of just pointing the QR at the
// banner-bearing login page).
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.daawatey.app";
// Canonical form (no /il/ country segment or ?l=he language param) so it
// redirects each visitor to their own region/language's App Store instead
// of forcing everyone into Israel/Hebrew regardless of their own device
// settings.
export const APP_STORE_URL = "https://apps.apple.com/app/id6807160850";

export function detectMobilePlatform() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  // iPadOS 13+ reports as "Macintosh" with touch support — the classic
  // iPhone/iPod UA check alone misses iPads on modern iPadOS.
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  return null;
}
