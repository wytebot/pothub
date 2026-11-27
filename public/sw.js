// Pothub PWA shell cache. HTML and navigations are network-first so a deployment
// becomes visible immediately; only static same-origin files are cached.
// __BUILD_ID__ is replaced at build time, so every deployment gets its own cache and the old one is deleted on activation.
const CACHE = 'pothub-static-__BUILD_ID__';
// The build fills this with every file the app needs (see vite.config.ts), so the whole app opens offline right after the first visit.
const PRECACHE = /*__PRECACHE__*/[];
const APP_SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  // One missing file must never stop the rest from being saved.
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all([...APP_SHELL, ...PRECACHE].map((u) => cache.add(u).catch(() => undefined)))));
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
      }).catch(async () => (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error())
    );
    return;
  }

  // Vite's fingerprinted /assets files never change, so the saved copy is used first (fast, and works offline).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
    return;
  }

  // Other static files: a fresh copy whenever online, the saved one otherwise.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error())
  );
});

// FCM data/notification push. Show a system notification even when the page is closed.
self.addEventListener('push', (event) => {
  let payload = {}; try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || 'Your background task is complete.' }; }
  const n = payload.notification || payload.data || payload;
  const title = n.title || 'Your Pothub answer is ready';
  const options = { body: n.body || 'Your background task is complete.', icon: n.icon || '/icon-192.png', badge: n.badge || '/icon-192.png', tag: n.tag || payload.data?.jobId || 'pothub-job', data: { route: payload.data?.route || n.route || '/' } };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a "your job is ready" notification brings Pothub forward and opens the right page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data && event.notification.data.route;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin));
    if (open) { open.postMessage({ type: 'notify-open', route }); return open.focus(); }
    return self.clients.openWindow('/' + (route ? '#' + route : ''));
  }));
});
