import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import { requestAndRegisterPush, setupNativePushListeners, setupWebForegroundListener } from '@/lib/push'

/** Registers this device for push the moment someone's actually signed
 * in (the backend endpoint requires auth, and there's nothing meaningful
 * to push to before then anyway), and handles both ways a push actually
 * reaches the user while the app's open:
 *   - native: tapping the system notification (tab is backgrounded/the
 *     app was launched fresh by the tap) — 'path' in its data payload
 *     (set server-side, see events.py's add_recipient) is where to land.
 *   - web: the tab is open and focused right now, so Firebase hands the
 *     message straight to the page instead of the service worker's
 *     onBackgroundMessage — surfaced as a toast, tappable the same way.
 * Mounted once at the Router level (see App.tsx), same as DeepLinkHandler. */
export default function PushNotificationHandler() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    if (!isAuthenticated) return
    requestAndRegisterPush().catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    const cleanupNative = setupNativePushListeners({
      onTap: (data) => {
        if (data?.path) navigate(data.path)
      },
    })
    const cleanupWeb = setupWebForegroundListener((payload) => {
      const path = payload.data?.path
      toast({
        title: payload.notification?.title,
        description: payload.notification?.body,
        duration: 6000,
        ...(path ? { onClick: () => navigate(path) } : {}),
      })
    })
    return () => {
      cleanupNative()
      cleanupWeb()
    }
  }, [navigate, toast])

  return null
}
