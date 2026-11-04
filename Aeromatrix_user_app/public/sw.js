/*
 * AeroMatrix For Users service worker.
 * It caches ONLY the app shell (the page and its built /assets files) and the static data files under /data/.
 * It never touches the model API, Open-Meteo, map tiles or the assistant (all cross-origin or /task2), so nothing
 * offline can be mistaken for current data.
 */
const CACHE = 'aeromatrix-user-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/aeromatrix-mark.svg', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/apple-touch-icon.png'];

// The page can ask a waiting worker to take over (the "update ready" bar).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  // No automatic skipWaiting: a new version waits until the user taps "Reload" (never swaps under an open form).
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('aeromatrix-user-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallbackKey || request);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // model API, Open-Meteo, tiles, assistant: never cached
  const path = url.pathname;
  if (path.startsWith('/task2/') || path.startsWith('/cesium/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
  } else if (path.startsWith('/assets/') || SHELL.includes(path)) {
    event.respondWith(cacheFirst(request));
  } else if (path.startsWith('/data/')) {
    event.respondWith(networkFirst(request));
  }
});
