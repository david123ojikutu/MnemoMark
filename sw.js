// Service Worker for MnemoMark PWA
const CACHE_NAME = 'mnemomark-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/homepage.css',
  '/auth.css',
  '/app.css',
  '/auth-config.js',
  '/auth-service.js',
  '/auth-ui.js',
  '/homepage.js',
  '/app.js',
  '/icon128.png',
  '/icon192.png',
  '/icon512.png',
  '/manifest.json'
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
