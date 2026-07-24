// noa. — service worker
// Stratégie "réseau d'abord" : le site est TOUJOURS à jour quand il y a du réseau.
// Le cache ne sert que de secours hors connexion. Aucune requête API n'est touchée.

const CACHE = 'noa-v5';
const PAGES = ['/landing.html', '/login.html', '/index.html', '/reset.html'];

// Routes à ne JAMAIS mettre en cache (API, auth, paiement)
const NO_CACHE = ['/generate', '/me', '/signup', '/webhook', '/stripe'];

self.addEventListener('install', event => {
  self.skipWaiting();                        // la nouvelle version s'active tout de suite
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PAGES)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())      // prend la main sur les onglets ouverts
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // On laisse passer sans rien faire :
  if (req.method !== 'GET') return;                      // POST, PUT...
  if (url.origin !== self.location.origin) return;       // Supabase, Google Fonts, CDN...
  if (NO_CACHE.some(p => url.pathname.startsWith(p))) return;

  // Réseau d'abord, cache en secours
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('/landing.html')))
  );
});
