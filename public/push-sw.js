/* global self, clients */
// Web Push handlers, imported into the generated service worker (see
// vite.config workbox.importScripts). Shows a notification when one arrives and
// focuses/opens the right workspace when tapped.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: 'New update', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'New update';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: payload.url || '/' },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Put a badge on the Home Screen app icon too. Use the count from the
      // payload if provided, otherwise a generic badge (a dot). The app itself
      // sets the exact number when it's opened.
      (async () => {
        try {
          if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
            if (typeof payload.badge === 'number') await self.navigator.setAppBadge(payload.badge);
            else await self.navigator.setAppBadge();
          }
        } catch (_e) { /* badge unsupported — ignore */ }
      })(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
