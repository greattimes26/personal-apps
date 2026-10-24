// Bump CACHE on every release so updates load.
const CACHE = 'hifz-mac-v2';
const FILES = [
  './', 'index.html', 'app.js', 'model.js', 'i18n.js', 'styles.css', 'manifest.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  '../../shared/store.js', '../../shared/quran.js', '../../shared/base.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hifz-mac-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates show up right away; cache when offline or slow (3s).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const res = await Promise.race([net, timeout]);
      if (res) return res;
    } catch { /* offline */ }
    return (await cache.match(e.request, { ignoreSearch: true })) || net;
  })());
});
