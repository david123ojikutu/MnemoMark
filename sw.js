// MnemoMark PWA service worker — scope-relative precache; cross-origin passthrough;
// network-first for same-origin JS so auth code updates are not stuck on stale cache.

const CACHE_NAME = 'mnemomark-v5';

function scopeBasePath() {
  const path = new URL(self.registration.scope).pathname;
  return path.endsWith('/') ? path : `${path}/`;
}

function originAndBase() {
  const u = new URL(self.registration.scope);
  return { origin: u.origin, base: scopeBasePath() };
}

function precacheUrls() {
  const { origin, base } = originAndBase();
  const rel = [
    '',
    'index.html',
    'css/index.css',
    'css/auth.css',
    'css/tags-and-highlights.css',
    'app.css',
    'js/auth-config.js',
    'js/auth-service.js',
    'js/auth-ui.js',
    'js/index.js',
    'js/tags-and-highlights.js',
    'tags-and-highlights.html',
    'assets/images/grayscale.png',
    'assets/images/logo.png',
    'icon128.png',
    'icon192.png',
    'icon512.png',
    'manifest.json'
  ];
  return rel.map((r) => (r ? `${origin}${base}${r}` : `${origin}${base}`));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const urls = precacheUrls();
      return Promise.allSettled(urls.map((url) => cache.add(url).catch(() => null)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (req.method !== 'GET') {
    return;
  }

  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((networkRes) => {
          if (networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
