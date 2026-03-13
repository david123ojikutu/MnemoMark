// Service Worker for MnemoMark PWA
const CACHE_NAME = 'mnemomark-v1';
const urlsToCache = [
  '/MnemoMark/',
  '/MnemoMark/index.html',
  '/MnemoMark/css/index.css',
  '/MnemoMark/css/auth.css',
  '/MnemoMark/css/tags-and-highlights.css',
  '/MnemoMark/app.css',
  '/MnemoMark/js/auth-config.js',
  '/MnemoMark/js/auth-service.js',
  '/MnemoMark/js/auth-ui.js',
  '/MnemoMark/js/index.js',
  '/MnemoMark/js/tags-and-highlights.js',
  '/MnemoMark/tags-and-highlights.html',
  '/MnemoMark/assets/images/grayscale.png',
  '/MnemoMark/assets/images/logo.png',
  '/MnemoMark/icon128.png',
  '/MnemoMark/icon192.png',
  '/MnemoMark/icon512.png',
  '/MnemoMark/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
