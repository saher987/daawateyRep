import { Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
)

// Adapted from the original: it also handled a "user_not_registered" state
// (Base44 apps could require the platform to pre-register an email before
// letting them in). Our get_app_user always creates a row on first sign-in
// instead of ever rejecting one — nobody using this app can be "not
// registered", so that branch (and UserNotRegisteredError) doesn't apply
// here and isn't ported.
export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth } = useAuth()

  if (isLoadingAuth) {
    return fallback
  }

  if (!isAuthenticated) {
    return unauthenticatedElement
  }

  return <Outlet />
}
