// Real push notifications (2026-09) — on top of, not instead of, the
// existing polled in-app Notification (Notifications.jsx). See
// backend/app/integrations/push.py and PushNotificationHandler.jsx (which
// wires this into the app: register on sign-in, navigate on tap).
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { app, firebaseConfig } from '@/lib/firebase'
import { base44 } from '@/api/base44Client'

/** Requests permission and registers this device for push, sending the
 * resulting token to the backend. Native: the token itself arrives later,
 * async, via the 'registration' listener set up in
 * setupNativePushListeners — this only triggers that flow. Web: getToken()
 * resolves with the token directly, so this handles the whole thing.
 * Silently no-ops on any missing prerequisite (unsupported browser, no
 * VAPID key configured yet, permission denied) — push is a bonus channel,
 * never something the rest of the app should block or error on. */
export async function requestAndRegisterPush() {
  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() !== 'android') return // iOS push: later session, needs APNs setup first
    const current = await PushNotifications.checkPermissions()
    let granted = current.receive === 'granted'
    if (!granted && current.receive !== 'denied') {
      const requested = await PushNotifications.requestPermissions()
      granted = requested.receive === 'granted'
    }
    if (!granted) return
    await PushNotifications.register()
    return
  }

  if (!('serviceWorker' in navigator) || !('Notification' in window)) return
  if (!(await isSupported().catch(() => false))) return
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) return // Firebase Console → Cloud Messaging → Web Push certificates, not set up yet

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  // firebase-messaging-sw.js can't import.meta.env its way to the config
  // (it's a static file, not run through Vite) — passed as query params
  // instead, which the SW reads back via self.location.search. None of
  // these are secret; they already ship in the built JS bundle regardless.
  const swUrl = `/firebase-messaging-sw.js?${new URLSearchParams(firebaseConfig).toString()}`
  const registration = await navigator.serviceWorker.register(swUrl)

  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  if (token) await base44.push.registerToken(token, 'web')
}

/** Native only: wires the async token-arrival and notification-tap events.
 * Returns a cleanup function removing both listeners. */
export function setupNativePushListeners({ onToken, onTap } = {}) {
  if (!Capacitor.isNativePlatform()) return () => {}

  const registrationListener = PushNotifications.addListener('registration', (token) => {
    base44.push.registerToken(token.value, Capacitor.getPlatform()).catch(() => {})
    onToken?.(token.value)
  })
  const tapListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    onTap?.(action.notification?.data)
  })

  return () => {
    registrationListener.then((l) => l.remove())
    tapListener.then((l) => l.remove())
  }
}

/** Web only: the message a service worker would otherwise catch, but for
 * a tab that's actually open and focused right now — Firebase delivers
 * those to the page directly instead of through the SW's
 * onBackgroundMessage. Returns a cleanup function. */
export function setupWebForegroundListener(onMessageReceived) {
  if (Capacitor.isNativePlatform()) return () => {}
  let unsubscribe = () => {}
  isSupported()
    .then((supported) => {
      if (!supported) return
      const messaging = getMessaging(app)
      unsubscribe = onMessage(messaging, (payload) => onMessageReceived?.(payload))
    })
    .catch(() => {})
  return () => unsubscribe()
}
