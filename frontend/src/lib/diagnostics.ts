import { Capacitor } from '@capacitor/core'
import { firebaseConfig } from './firebase'

/**
 * Build/runtime facts worth showing on-device.
 *
 * The point of this is answering "is this build even pointed where I think it
 * is?" without a debugger attached — which build's config is baked in, which
 * Firebase project, which backend, and which platform path the auth code will
 * take. Note there is deliberately no "auth URL" here: on native, sign-in goes
 * through Android's Credential Manager (a system API talking to Google Play
 * Services), not a web redirect, so no URL exists to report. Only the web path
 * (`signInWithPopup`) involves one.
 */

/**
 * Short, human-readable build marker shown next to "Welcome" in the UI.
 *
 * CI sets VITE_BUILD_ID to "<run number>-<commit sha>"; this trims the sha to
 * keep it glanceable. The run number increments on every workflow run, so this
 * changes on every build without anyone having to remember to bump it — the
 * point is being able to confirm at a glance that a device is running the
 * build you just made, rather than a stale install.
 */
export const BUILD_LABEL = (() => {
  const raw = import.meta.env.VITE_BUILD_ID
  if (!raw) return 'local'
  const [run, sha] = raw.split('-', 2)
  return sha ? `${run} (${sha.slice(0, 7)})` : run
})()

/** Shows enough of a value to identify it, without dumping the whole string. */
function maskMiddle(value: string | undefined, keepStart = 8, keepEnd = 4): string {
  if (!value) return '(unset)'
  if (value.length <= keepStart + keepEnd) return value
  return `${value.slice(0, keepStart)}…${value.slice(-keepEnd)}`
}

export function collectDiagnostics(): Record<string, string> {
  return {
    // Stamped in at build time by CI (run number + commit). This is the only
    // reliable way to tell, on-device, whether you're looking at the build you
    // just made or a stale install — the rest of these values often look
    // identical across builds even when native config changed underneath.
    buildId: import.meta.env.VITE_BUILD_ID || '(local build)',
    platform: Capacitor.getPlatform(),
    isNative: String(Capacitor.isNativePlatform()),
    authPluginAvailable: String(Capacitor.isPluginAvailable('FirebaseAuthentication')),
    // On native this is the WebView's own origin (e.g. https://localhost) —
    // it must be present in the backend's ALLOWED_ORIGINS for API calls to
    // survive CORS.
    webViewOrigin: window.location.origin,
    firebaseProjectId: firebaseConfig.projectId || '(unset)',
    firebaseAuthDomain: firebaseConfig.authDomain || '(unset)',
    firebaseAppId: firebaseConfig.appId || '(unset)',
    // Masked mainly so it stays copy-pasteable: a full AIza… string trips
    // some clipboard/DLP scanners, which silently corrupts it in transit.
    firebaseApiKey: maskMiddle(firebaseConfig.apiKey),
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '(unset → defaults to localhost:8000)',
    allowEmailAuth: import.meta.env.VITE_ALLOW_EMAIL_AUTH || '(unset → treated as true)',
  }
}

export function formatDiagnostics(): string {
  return Object.entries(collectDiagnostics())
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}
