const CACHE_NAME = 'truckdash-v61';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.css?v=20260927a',
  './app.js?v=20260927a',
  './convoy.js?v=20260927a',
  './livemap.js?v=20260927a',
  './variants.js?v=20260927a',
  './pure.js?v=20260927a',
  './i18n.js?v=20260927a',
  './i18n_en_es.js?v=20260927a',
  '../dash/dash.js?v=20260927a',
  '../dash/dash.css?v=20260927a',
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
