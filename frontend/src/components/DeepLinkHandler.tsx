import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp, type URLOpenListenerEvent } from '@capacitor/app'

/**
 * Android App Links (see android/app/src/main/AndroidManifest.xml's
 * autoVerify intent-filter + public/.well-known/assetlinks.json): when the
 * OS routes an https://<host>/i/<token> tap into this app instead of the
 * browser, Capacitor's App plugin surfaces it as `appUrlOpen` with the full
 * external URL — not a route the SPA's router already knows how to reach,
 * since it's an https:// URL, not the app's internal path. This translates
 * it into an in-app navigation instead of leaving the WebView stuck on
 * whatever it happened to be showing.
 *
 * Fires for both a cold start (app wasn't running, launched via the link)
 * and a warm one (app already running, singleTask launchMode routes the new
 * intent back into it) — Capacitor buffers the launch URL and replays it
 * once a listener is registered, so a single handler here covers both.
 *
 * No-op on web/iOS: web already handles /i/:token as a normal route (see
 * App.tsx), and this only matters once App Links are set up.
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      try {
        const url = new URL(event.url)
        navigate(url.pathname + url.search, { replace: false })
      } catch {
        // Malformed/unexpected URL shape — nothing sensible to navigate to,
        // and this must never crash the app over a link it didn't send.
      }
    })

    return () => {
      listenerPromise.then((listener) => listener.remove())
    }
  }, [navigate])

  return null
}
