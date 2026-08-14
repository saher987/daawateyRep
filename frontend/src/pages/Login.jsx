// Was Login.tsx (Milestone 1 scaffolding). Converted to .jsx to match every
// other page that renders the shared ui/ components: those components
// (button.jsx, input.jsx, label.jsx, ...) are untyped .jsx themselves, and
// `tsc -b` only type-checks .tsx/.ts files — from a .tsx file their props
// resolve to just `RefAttributes<any>`, rejecting id/children/onClick/etc.
// entirely. Every other ported page sidesteps this the same way. No logic
// changed from the .tsx version, just the type annotations dropped.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { LogIn, Mail, Lock, Loader2 } from 'lucide-react'
import { auth } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { BUILD_LABEL, formatDiagnostics } from '../lib/diagnostics'
import { translations, usePublicLanguage } from '../lib/i18n'
import AuthLayout from '../components/AuthLayout'
import GoogleIcon from '../components/GoogleIcon'
import AppleIcon from '../components/AppleIcon'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

// Not rendered on the page anymore (it's not something a real user should
// ever see) — logged to the console instead, so it's still reachable by
// asking someone to open devtools when something needs debugging on a
// device we can't attach to directly.
if (typeof window !== 'undefined') {
  console.info(`[daawatey] build ${BUILD_LABEL}\n${formatDiagnostics()}`)
}

// Email/password is meant for test builds only — simulators and device farms
// can't run a real Google/Apple picker. Prod builds must never set this flag.
// On web today it's always effectively on; the flag starts mattering once
// native builds exist.
const allowEmailAuth = import.meta.env.VITE_ALLOW_EMAIL_AUTH !== 'false'

// Temporary, verbose diagnostic formatter — surfaces every field an error
// might carry (native plugin errors often attach a `code` alongside
// `message`, and sometimes other fields), since the on-device console isn't
// otherwise reachable without a debugger attached.
function describeError(err) {
  if (err instanceof Error) {
    const extra = {}
    for (const key of Object.keys(err)) {
      if (key !== 'message' && key !== 'name' && key !== 'stack') {
        extra[key] = err[key]
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
  const [lang, setLang] = usePublicLanguage()
  const t = translations[lang]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [appleBusy, setAppleBusy] = useState(false)

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
    setGoogleBusy(true)
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
      setGoogleBusy(false)
    }
  }

  async function handleAppleSignIn() {
    setError(null)
    setAppleBusy(true)
    let step = 'start'
    try {
      if (Capacitor.isNativePlatform()) {
        // No Credential Manager/legacy-picker split here — that's a
        // Google-specific Android quirk (see handleGoogleSignIn). Apple's
        // native flow is the system ASAuthorizationController sheet, one
        // path, iOS-only (the button below is hidden on Android — see the
        // render section for why).
        step = 'native: signInWithApple'
        const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true })

        step = 'native: read idToken/nonce from plugin result'
        const idToken = result.credential?.idToken
        // Apple's credential carries the *raw* nonce (unhashed) here —
        // Firebase's OAuthProvider.credential() re-hashes it itself to
        // verify against the hashed nonce Apple's server already checked.
        // Passing the wrong one is a silent auth failure, not an error
        // message, so this is worth naming explicitly rather than just
        // "nonce".
        const rawNonce = result.credential?.nonce
        if (!idToken) {
          throw new Error(
            `Plugin returned no idToken. credential=${JSON.stringify(result.credential ?? null)}`,
          )
        }

        step = 'web SDK: signInWithCredential'
        const provider = new OAuthProvider('apple.com')
        await signInWithCredential(auth, provider.credential({ idToken, rawNonce }))
      } else {
        step = 'web SDK: signInWithPopup'
        const provider = new OAuthProvider('apple.com')
        // Apple only ever hands over name/email on the very first
        // authorization for a given app — request both scopes up front so
        // that first response actually carries something to store,
        // instead of getting a silent "user.displayName is null" later.
        provider.addScope('email')
        provider.addScope('name')
        await signInWithPopup(auth, provider)
      }
    } catch (err) {
      setError(`[failed at ${step}]\n${describeError(err)}`)
    } finally {
      setAppleBusy(false)
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      icon={LogIn}
      title={t.authWelcomeBack}
      subtitle={t.authLoginSubtitle}
      dir={t.dir}
      lang={lang}
      onLanguageChange={setLang}
      footer={
        allowEmailAuth ? (
          <>
            {t.authNoAccount}{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              {t.authSignUp}
            </Link>
          </>
        ) : undefined
      }
    >
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleGoogleSignIn}
        disabled={googleBusy || busy || appleBusy}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        {googleBusy ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t.authConnecting}
          </>
        ) : (
          t.authContinueWithGoogle
        )}
      </Button>

      {/* Apple's own guideline (not just App Store review — it's the actual
          HIG) is a solid black button, not an outlined one matching the
          other providers. Hidden on native Android: Sign in with Apple is
          an App Store requirement for iOS apps that offer third-party
          login, not something Android users would ever expect or need —
          and the plugin's Android support for it is unverified here. */}
      {Capacitor.getPlatform() !== 'android' && (
        <Button
          type="button"
          className="w-full h-12 text-sm font-medium mb-6 bg-black text-white hover:bg-black/90"
          onClick={handleAppleSignIn}
          disabled={appleBusy || googleBusy || busy}
        >
          <AppleIcon className="w-5 h-5 mr-2" />
          {appleBusy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t.authConnecting}
            </>
          ) : (
            t.authContinueWithApple
          )}
        </Button>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm whitespace-pre-wrap break-words"
        >
          {error}
        </div>
      )}

      {allowEmailAuth && (
        <>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">{t.authOr}</span>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t.authEmail}</Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t.authPassword}</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  {t.authForgotPassword}
                </Link>
              </div>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 font-medium" disabled={busy || googleBusy}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.authLoggingIn}
                </>
              ) : (
                t.login
              )}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
