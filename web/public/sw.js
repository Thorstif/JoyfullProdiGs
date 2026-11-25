// Service worker: receives Web Push messages and opens the app when a notification is tapped.
// Kept tiny on purpose; it does not cache anything, so updates are instant.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'JoyfullProdiGs', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'JoyfullProdiGs';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  };
  // iOS requires every push to show a notification, or it may revoke the subscription.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.navigator && 'setAppBadge' in self.navigator ? self.navigator.setAppBadge(1).catch(() => {}) : null,
      self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push', data }))),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'navigate', url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
