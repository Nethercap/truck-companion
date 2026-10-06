const CACHE_NAME = 'truckdash-v105';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.css?v=20261006n',
  './app.js?v=20261006n',
  './convoy.js?v=20261006n',
  './livemap.js?v=20261006n',
  './variants.js?v=20261006n',
  './pure.js?v=20261006n',
  './i18n.js?v=20261006n',
  './i18n_en_es.js?v=20261006n',
  '../dash/dash.js?v=20261006n',
  '../dash/dash.css?v=20261006n',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './vendor/maplibre-gl-4.7.1.js',
  './vendor/maplibre-gl-4.7.1.css',
  './vendor/pmtiles-3.2.0.js',
  './vendor/proj4-2.15.0.js',
];

// Lo que se guarda para tener sin red: el sitio y los datos del mapa. El
// relay no: /health o /version sacados de la cache dicen algo que ya no es
// cierto.
const CACHEABLE_ORIGINS = [self.location.origin, 'https://maps.trucksim-dash.com'];

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
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!CACHEABLE_ORIGINS.includes(new URL(req.url).origin)) return;
  // Los tiles del mapa se piden por rango (pmtiles) y llegan como 206, que
  // la Cache API rechaza: cada tile se clonaba para nada y tiraba un error.
  if (req.headers.has('range')) return;
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
