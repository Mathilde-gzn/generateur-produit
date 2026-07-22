const CACHE_NAME = 'noa-v2';
const urlsToCache = [
  '/landing.html',
  '/login.html',
  '/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les appels API et Supabase
  if (
    url.pathname.startsWith('/generate') ||
    url.pathname.startsWith('/me') ||
    url.pathname.startsWith('/signup') ||
    url.pathname.startsWith('/webhook') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('anthropic') ||
    url.hostname.includes('stripe')
  ) {
    return;
  }

  // Pour les fichiers statiques, utiliser le cache
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
