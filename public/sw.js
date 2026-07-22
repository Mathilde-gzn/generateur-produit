const CACHE_NAME = 'noa-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Ne rien intercepter — laisser passer toutes les requêtes normalement
self.addEventListener('fetch', event => {
  return;
});
