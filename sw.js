/**
 * sw.js — Service worker: siteyi çevrimdışı da açılabilir yapar (PWA).
 *
 * Strateji:
 *  - Sitenin kendi dosyaları: önce ağ (her zaman güncel sürüm), ağ yoksa önbellek.
 *  - Sürümü sabit CDN kütüphanesi (astronomy-engine@2.1.19): önce önbellek (hiç değişmez).
 *  - Hava/konum API'leri: hiç önbelleğe alınmaz (eski tahmin yanıltıcı olur).
 *
 * Dosya listesini değiştirdiğinde CACHE sürümünü artır ki eski önbellek temizlensin.
 */

const CACHE = 'skytonight-v1';
const CDN_ASSETS = ['https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/esm/astronomy.js'];
const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'js/app.js',
  'js/state.js',
  'js/data.js',
  'js/services/geo.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/charts.js',
  'js/ui/sheet.js',
  'js/ui/tonight-card.js',
  'js/ui/timeline.js',
  'js/ui/week-strip.js',
  'js/ui/object-list.js',
  'js/ui/object-detail.js',
  'js/ui/events-list.js',
  'js/ui/location-sheet.js',
  'js/ui/settings-sheet.js',
  'core/format.js',
  'core/directions.js',
  'core/equipment.js',
  'core/astro.js',
  'core/weather.js',
  'core/scoring.js',
  'core/visibility.js',
  'core/night.js',
  'core/objects.js',
  'core/events.js',
  'data/catalog.json',
  'data/planets.json',
  'data/constellations.json',
  'data/meteor-showers.json',
  'icons/favicon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([...APP_SHELL, ...CDN_ASSETS]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (CDN_ASSETS.includes(request.url)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true })),
    );
  }
  // Diğer istekler (hava, konum API'leri) tarayıcının normal akışına bırakılır.
});
