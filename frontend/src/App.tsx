import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from './lib/query-client'
import { AuthProvider } from './lib/AuthContext'
import { I18nProvider } from './lib/i18n'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import PageNotFound from './lib/PageNotFound'
import { Login } from './pages/Login'

// Route-level code splitting, same pattern as the original app.
const MyInvitations = lazy(() => import('./pages/MyInvitations'))
const MyEvent = lazy(() => import('./pages/MyEvent'))
const Events = lazy(() => import('./pages/Events'))
const CreateEvent = lazy(() => import('./pages/CreateEvent'))
const EventDetails = lazy(() => import('./pages/EventDetails'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Profile = lazy(() => import('./pages/Profile'))
const InvitationPage = lazy(() => import('./pages/InvitationPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Users = lazy(() => import('./pages/Users'))
const EventRequests = lazy(() => import('./pages/EventRequests'))
const PlannedWeddings = lazy(() => import('./pages/PlannedWeddings'))
const Invitees = lazy(() => import('./pages/Invitees'))
const Venues = lazy(() => import('./pages/Venues'))

const PageSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
)

// Routes still NOT wired up here — their backend doesn't exist yet:
// /venue-schedule, /my-venues(/:id) (Flow E's venue-*owner*-side calendar
// views — need a venue-scoped events endpoint plus a calendar component,
// neither built yet). /venues (admin/manager venue management) IS wired
// below. AppLayout's nav still links to the schedule/my-venues routes for
// venue_owner accounts; following one lands on PageNotFound until it's
// built, which is honest rather than hiding a real gap.
function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/i/:token"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <InvitationPage />
                  </Suspense>
                }
              />

              <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
                <Route element={<AppLayout />}>
                  <Route
                    path="/"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <MyInvitations />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Dashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Users />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/event-requests"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <EventRequests />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/planned-weddings"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <PlannedWeddings />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/invitees"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Invitees />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/venues"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Venues />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/my-invitations"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <MyInvitations />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/my-event"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <MyEvent />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/events"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Events />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/events/new"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <CreateEvent />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/events/:id"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <EventDetails />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Notifications />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <Suspense fallback={<PageSpinner />}>
                        <Profile />
                      </Suspense>
                    }
                  />
                </Route>
              </Route>

              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </Router>
        </QueryClientProvider>
      </I18nProvider>
    </AuthProvider>
  )
}

export default App
