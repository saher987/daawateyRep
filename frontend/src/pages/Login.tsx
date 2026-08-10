import { useState, type FormEvent } from 'react'
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
import { formatDiagnostics } from '../lib/diagnostics'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        step = 'native: FirebaseAuthentication.signInWithGoogle'
        const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })

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
      <h1>Welcome</h1>
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
