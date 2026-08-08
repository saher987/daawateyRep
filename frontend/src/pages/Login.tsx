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

// Email/password is meant for test builds only — simulators and device farms
// can't run a real Google/Apple picker. Prod builds must never set this flag.
// On web today it's always effectively on; the flag starts mattering once
// native builds exist.
const allowEmailAuth = import.meta.env.VITE_ALLOW_EMAIL_AUTH !== 'false'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setBusy(true)
    try {
      if (Capacitor.isNativePlatform()) {
        // signInWithPopup doesn't work in a WebView — run the system Google
        // picker via the native plugin instead, then bridge its ID token
        // into the web SDK so auth.currentUser/getIdToken() behave exactly
        // like on web. skipNativeAuth avoids also signing into the native
        // Android/iOS Firebase SDK, which would be a second, divergent
        // source of truth alongside the JS SDK we use everywhere else.
        const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
        const credential = GoogleAuthProvider.credential(result.credential?.idToken)
        await signInWithCredential(auth, credential)
      } else {
        await signInWithPopup(auth, new GoogleAuthProvider())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
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
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Sign in</h1>
      {error && <p role="alert">{error}</p>}

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
    </div>
  )
}
