# Architecture

## Environments

Two fully separate Firebase/GCP projects — no shared resources between them:

| | staging | prod |
|---|---|---|
| Firebase/GCP project ID | `daawatey-staging` | `daawatey-prod` |
| Project number | `742481007794` | `1046309287701` |
| Frontend env file | `frontend/.env.staging` | `frontend/.env.production` |

Both have Firebase Authentication enabled with **Google** and **Email/Password**
providers. Web app config is not secret (it ships in the frontend bundle) but
is still kept out of git since it's per-environment — see `frontend/.env.example`.

Cloud Run services, Artifact Registry, and the CI/CD deploy targets for each
environment are set up in Milestone 2.

## Auth

Firebase Authentication is the identity provider. The frontend signs the user
in with the Firebase Web SDK and gets a Firebase ID token; the backend verifies
that token on every request via the Firebase Admin SDK
(`backend/app/auth.py`) and derives identity **only** from the verified
token's claims — a client can never assert its own user id.

```
[Browser] --signInWithPopup/signInWithEmailAndPassword--> [Firebase Auth]
[Browser] --Authorization: Bearer <ID token>--> [FastAPI backend]
[FastAPI] --verify_id_token()--> [Firebase Admin SDK] --> uid/email (trusted)
```

## Mobile (Capacitor) — Android working, iOS not yet built

The web app is wrapped with Capacitor. The Android app is built and
distributed via Play internal testing, with native Google sign-in verified
end-to-end on a Play-installed build. iOS and Apple Sign-In are deferred
until an Apple Developer account is in hand.

Two Firebase-in-WebView failure modes were known in advance from prior
experience and are baked in below. A third — Play App Signing certificates —
was hit during the first Play release and is documented in
`frontend/README.md`; it was the cause of the Google Sign-In failure on the
previous Base44 Play build, and is *not* a Base44-specific problem.

### 1. Auth initialization must branch on platform

Plain `getAuth()` throws an opaque `"Script error."` with no stack in the
`capacitor://localhost` WKWebView scheme — Firebase's persistence
feature-detection doesn't handle that scheme. Fix, already in
`frontend/src/lib/firebase.ts`:

```ts
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app)
```

### 2. Social sign-in needs the native picker, bridged into the web SDK

`signInWithPopup` doesn't work in a WebView. Implemented in
`frontend/src/pages/Login.tsx`: `@capacitor-firebase/authentication` runs the
system Google picker on native, then its result is bridged into the web SDK
with `signInWithCredential` so `auth.currentUser` / `getIdToken()` behave
identically to web. `skipNativeAuth: true` is passed so the native
Android/iOS Firebase SDK is never also signed in — the web/JS SDK stays the
single source of truth for auth state everywhere in this app:

```ts
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'

const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
const credential = GoogleAuthProvider.credential(result.credential?.idToken)
await signInWithCredential(auth, credential)
```

### 3. Apple Sign-In: nonce handling is mandatory

Apple's ID token is single-use and nonce-bound. The native plugin call must
pass `skipNativeAuth: true`, and the plugin's returned nonce must be fed back
as `rawNonce` when rebuilding the credential — skipping this causes a
"duplicate credential / invalid nonce" rejection:

```ts
const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true })
const credential = new OAuthProvider('apple.com').credential({
  idToken: result.credential?.idToken,
  rawNonce: result.credential?.nonce,
})
await signInWithCredential(auth, credential)
```

Apple Sign-In is deferred until an Apple Developer account is in hand
(Services ID + key setup needed in the Apple Developer console).

### 4. Test-only email/password path

Simulators and device farms can't run a real Google/Apple picker. The
email/password path in `Login.tsx` stays available for test builds, gated by
`VITE_ALLOW_EMAIL_AUTH` — prod builds (web or native) must never set this.

## Database — deferred

Not decided yet. `/migrations` exists as an empty placeholder so the eventual
layout doesn't require restructuring. When we get here:

- **Firestore**: no separate migration story, scales effortlessly, but
  querying/joins are more limited and schema is implicit.
- **Cloud SQL (Postgres)**: real relational queries/joins/transactions, but
  needs connection management from Cloud Run (Cloud SQL Auth Proxy or
  private IP) and manual migrations. If chosen, migration scripts go in
  `/migrations`, written to be run manually against Cloud SQL by you —
  never auto-applied on deploy.

Revisit after Milestone 1 (login) and Milestone 2 (CI/CD) are done, once the
app's actual data/query shape is clearer.
