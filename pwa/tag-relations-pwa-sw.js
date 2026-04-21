/* MnemoMark Tag Relations PWA — do not cache Firebase / Google APIs */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (
    url.includes("googleapis.com") ||
    url.includes("gstatic.com") ||
    url.includes("google.com")
  ) {
    return;
  }
  event.respondWith(fetch(event.request));
});
