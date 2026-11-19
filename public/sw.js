// Pothub PWA shell cache. HTML and navigations are network-first so a deployment
// becomes visible immediately; only static same-origin files are cached.
// __BUILD_ID__ is replaced at build time, so every deployment gets its own cache and the old one is deleted on activation.
const CACHE = 'pothub-static-__BUILD_ID__';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pothub-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Auth helpers and backend/API requests must never be intercepted or cached.
  if (url.pathname === '/version.json' || url.pathname.startsWith('/__/auth/') || url.pathname.startsWith('/__/firebase/') || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put('/', response.clone()));
        return response;
      }).catch(async () => (await caches.match('/')) || Response.error())
    );
    return;
  }

  // Vite's fingerprinted /assets files are immutable; other static files use
  // stale-while-revalidate with a fresh response preferred whenever online.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error())
  );
});
