const CACHE_NAME = 'truckdash-v56';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.css?v=20260924c',
  './app.js?v=20260924c',
  './convoy.js?v=20260924c',
  './livemap.js?v=20260924c',
  './variants.js?v=20260924c',
  './pure.js?v=20260924c',
  './i18n.js?v=20260924c',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
