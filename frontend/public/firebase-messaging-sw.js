// Handles push notifications while no tab has the site open (a message
// with the tab open/foregrounded is handled in lib/push.js's onMessage
// listener instead — this file only ever runs for background delivery).
//
// Can't import.meta.env its way to the real Firebase config the way the
// rest of the app does — this file is served as a static asset, not run
// through Vite. lib/push.js registers it with the actual config values
// as query params instead (none of them are secret — same values already
// ship in the built JS bundle, see lib/firebase.ts), and self.location
// below reads them back out.
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

// data.path (set by app.integrations.push's send_push_to_user calls — see
// events.py's add_recipient) is stashed on the shown notification so the
// click handler below knows where to send the tap.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'דעוותי';
  self.registration.showNotification(title, {
    body: payload.notification?.body,
    icon: '/favicon.svg',
    data: payload.data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || '/my-invitations';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Already-open tab: navigate it in place rather than opening a
        // second one — 'navigate' is only actually usable when the client
        // is same-origin-focusable, hence the try/catch fallback.
        if ('focus' in client) {
          try {
            client.navigate(path);
          } catch {
            /* fall through to opening a fresh window below */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(path);
    })
  );
});
