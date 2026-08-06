import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  type Auth,
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'

const firebaseConfig = {
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
// There's no Capacitor shell yet, but Capacitor.isNativePlatform() is a safe
// no-op (always false) until one exists, so this branch is dead code on web
// today and just works once a native shell is added — no rewrite needed.
export const auth: Auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app)
