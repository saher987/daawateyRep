import { Capacitor } from "@capacitor/core";

// Public site that guests open links on.
export const PUBLIC_APP_ORIGIN = "https://daawatey.com";

// Origin to put in links meant for someone else (guest invitation links,
// password-reset emails). window.location.origin is right on the website,
// but inside the native app it's https://localhost (Android) or
// capacitor://localhost (iOS) — links copied/shared from there pointed at
// localhost. Native builds and local dev therefore always use the public
// domain; any other web origin (prod, staging) keeps its own.
export function publicAppOrigin() {
  const { hostname, origin } = window.location;
  if (Capacitor.isNativePlatform() || hostname === "localhost" || hostname === "127.0.0.1") {
    return PUBLIC_APP_ORIGIN;
  }
  return origin;
}
