import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  type Auth,
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'

// Exported so the on-screen diagnostics panel can report which project/app a
// given build is actually pointed at — none of this is secret (it all ships
// in the JS bundle), and it's the fastest way to tell a stale build from a
// current one on a device you can't attach a debugger to.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app: FirebaseApp = initializeApp(firebaseConfig)

// On native (Capacitor's WKWebView, `capacitor://localhost` scheme), plain
// getAuth() throws an opaque "Script error." with no stack — Firebase's
// persistence feature-detection doesn't handle that scheme. Initializing
// auth explicitly with indexedDBLocalPersistence avoids that path entirely.
// Capacitor.isNativePlatform() is false on web (this branch is dead code
// there) and true inside the Android shell (frontend/android).
export const auth: Auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app)
