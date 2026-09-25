import React, { createContext, useState, useContext, useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { base44 } from '@/api/base44Client'

// Sync with system dark mode — ported unchanged from the original.
function useDarkModeSync() {
  useEffect(() => {
    const root = document.documentElement
    const apply = (dark) => root.classList.toggle('dark', dark)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)
    const handler = (e) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
}

const AuthContext = createContext()

// Adapted from the original Base44-backed AuthContext to Firebase Auth +
// this app's own /api/me. What every ported page actually depends on is
// the *shape* this exposes (user/isAuthenticated/isLoadingAuth/logout/
// navigateToLogin), not how it's derived underneath — so pages didn't need
// to change, only this file did.
//
// `appPublicSettings`/`isLoadingPublicSettings` existed for a Base44-
// platform concept (an app-level registration gate) this system doesn't
// have — get_app_user always creates a row rather than rejecting a
// sign-in, so there's no "not registered" state to represent. Kept as
// always-false/null purely so components destructuring them (there
// shouldn't be any left that rely on them being anything else) don't break.
// `authError` used to be the same kind of permanent stub, but is real now
// (2026-09-25) — see its own declaration below for why.
export const AuthProvider = ({ children }) => {
  useDarkModeSync()
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  // Was a permanent `null` stub (see this file's own header comment) —
  // repurposed 2026-09-25 to actually hold /api/me's failure, since a
  // Firebase sign-in (Apple/Google/phone-OTP, any of them) that succeeds
  // but is then rejected by this app's own backend previously had zero
  // visible symptom: refreshUser's catch only ever did console.error,
  // which nobody testing on-device without a debugger attached can see.
  // Login.jsx renders this.
  const [authError, setAuthError] = useState(null)
  const hasRecordedLogin = useRef(false)

  // Shared by the initial auth-state listener below and checkAppState (the
  // original's name for "go re-fetch who I am" — kept as-is because
  // Profile.jsx calls it by that name after saving, expecting exactly this:
  // without it, a profile save updates the backend but this component's
  // `user` stays stale until the next full sign-in, which is what caused
  // AppLayout's profile-completeness redirect to loop forever even after
  // the required fields were actually saved.
  const refreshUser = async () => {
    try {
      const me = await base44.auth.me()
      setUser(me)
      setIsAuthenticated(true)
      setAuthError(null)
    } catch (error) {
      console.error('Fetching /api/me failed:', error)
      setUser(null)
      setIsAuthenticated(false)
      const status = error?.status ? ` (${error.status})` : ''
      setAuthError(`${error?.message || String(error)}${status}`)
    }
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextFirebaseUser) => {
      setFirebaseUser(nextFirebaseUser)
      hasRecordedLogin.current = false

      if (!nextFirebaseUser) {
        setUser(null)
        setIsAuthenticated(false)
        setIsLoadingAuth(false)
        return
      }

      await refreshUser()
      setIsLoadingAuth(false)
    })
  }, [])

  const logout = (redirectTo) => {
    base44.auth.logout(redirectTo)
  }

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError,
        appPublicSettings: null,
        logout,
        navigateToLogin,
        checkAppState: refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
