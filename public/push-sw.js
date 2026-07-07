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
  event.waitUntil(self.registration.showNotification(title, options));
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
