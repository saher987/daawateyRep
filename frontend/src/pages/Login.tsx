import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { auth } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { BUILD_LABEL, formatDiagnostics } from '../lib/diagnostics'

// Computed once at module load — these facts don't change at runtime.
const diagnostics = formatDiagnostics()

// Email/password is meant for test builds only — simulators and device farms
// can't run a real Google/Apple picker. Prod builds must never set this flag.
// On web today it's always effectively on; the flag starts mattering once
// native builds exist.
const allowEmailAuth = import.meta.env.VITE_ALLOW_EMAIL_AUTH !== 'false'

// Temporary, verbose diagnostic formatter — surfaces every field an error
// might carry (native plugin errors often attach a `code` alongside
// `message`, and sometimes other fields), since the on-device console isn't
// otherwise reachable without a debugger attached.
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const extra: Record<string, unknown> = {}
    for (const key of Object.keys(err)) {
      if (key !== 'message' && key !== 'name' && key !== 'stack') {
        extra[key] = (err as unknown as Record<string, unknown>)[key]
      }
    }
    const extraStr = Object.keys(extra).length > 0 ? ` | extra: ${JSON.stringify(extra)}` : ''
    return `${err.name}: ${err.message}${extraStr}`
  }
  try {
    return `Non-Error thrown: ${JSON.stringify(err)}`
  } catch {
    return `Non-Error thrown: ${String(err)}`
  }
}

export function Login() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoadingAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The Google/email flows below only ever *complete Firebase's* sign-in —
  // AuthContext's onAuthStateChanged listener picks that up asynchronously,
  // resolves /api/me, and flips isAuthenticated. Nothing else here ever
  // navigates anywhere, so without this effect a successful sign-in just
  // leaves the user looking at this same form forever (the original app's
  // email-login path did a hard `window.location.href` redirect; that
  // doesn't exist in this port at all). Matches the original's actual
  // behavior of always landing on "/" — including for admins, who reach
  // /dashboard by clicking the nav item, not via a special login redirect.
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, isLoadingAuth, navigate])

  async function handleGoogleSignIn() {
    setError(null)
    setBusy(true)
    // Tracks how far we got, so a failure says which stage broke rather than
    // just "sign-in failed": the native picker and the web-SDK exchange fail
    // for completely different reasons and need different fixes.
    let step = 'start'
    try {
      if (Capacitor.isNativePlatform()) {
        // signInWithPopup doesn't work in a WebView — run the system Google
        // picker via the native plugin instead, then bridge its ID token
        // into the web SDK so auth.currentUser/getIdToken() behave exactly
        // like on web. skipNativeAuth avoids also signing into the native
        // Android/iOS Firebase SDK, which would be a second, divergent
        // source of truth alongside the JS SDK we use everywhere else.
        // Two native paths exist, and they validate differently:
        //
        // 1. Credential Manager (the plugin's default) — the modern API. When
        //    it rejects an app it throws NoCredentialException, whose message
        //    is just "No credentials available"; the real reason (e.g.
        //    "[28444] Developer console is not set up correctly") is written
        //    only to the system log, so it never reaches JS.
        // 2. The legacy GoogleSignIn picker (`useCredentialManager: false`) —
        //    older, but throws ApiException, whose message *includes* a
        //    numeric status code that does reach JS (e.g. 10 = DEVELOPER_ERROR,
        //    12500 = sign-in failed).
        //
        // So fall back to (2) when (1) fails: it sometimes succeeds where
        // Credential Manager doesn't, and when it doesn't it at least yields
        // an error we can actually act on without attaching a debugger.
        step = 'native: signInWithGoogle (Credential Manager)'
        let result
        try {
          result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
        } catch (credentialManagerError) {
          step = 'native: signInWithGoogle (legacy picker fallback)'
          try {
            result = await FirebaseAuthentication.signInWithGoogle({
              skipNativeAuth: true,
              useCredentialManager: false,
            })
          } catch (legacyPickerError) {
            throw new Error(
              `both native paths failed.\n` +
                `- Credential Manager: ${describeError(credentialManagerError)}\n` +
                `- Legacy picker: ${describeError(legacyPickerError)}`,
            )
          }
        }

        step = 'native: read idToken from plugin result'
        const idToken = result.credential?.idToken
        if (!idToken) {
          // Guard rather than passing undefined into credential(), which
          // would fail later with a much less obvious message.
          throw new Error(
            `Plugin returned no idToken. credential=${JSON.stringify(result.credential ?? null)}`,
          )
        }

        step = 'web SDK: signInWithCredential'
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
      } else {
        step = 'web SDK: signInWithPopup'
        await signInWithPopup(auth, new GoogleAuthProvider())
      }
    } catch (err) {
      setError(`[failed at ${step}]\n${describeError(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>
        Welcome{' '}
        <span style={{ fontSize: '0.45em', fontWeight: 400, opacity: 0.65 }}>
          build {BUILD_LABEL}
        </span>
      </h1>
      <p style={{ fontSize: '1.1rem' }}>Sign in to continue</p>
      {error && (
        <p role="alert" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          {error}
        </p>
      )}

      <button type="button" onClick={handleGoogleSignIn} disabled={busy}>
        Sign in with Google
      </button>

      {allowEmailAuth && (
        <>
          <hr />
          <form onSubmit={handleEmailSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
            <button type="submit" disabled={busy}>
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </>
      )}

      <details style={{ marginTop: '2rem', fontSize: '0.85rem' }}>
        <summary>Build diagnostics</summary>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: '0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '4px',
          }}
        >
          {diagnostics}
        </pre>
      </details>
    </div>
  )
}
