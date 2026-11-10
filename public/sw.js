const CACHE = 'pothub-shell-v8';
// Replaced at build time so every deployment prompts an update in existing clients.
const BUILD_ID = '__POTHUB_BUILD_ID__';
const SHELL = [
  '/manifest.webmanifest',
  '/icons/pothub-192.png',
  '/icons/pothub-512.png',
  '/icons/pothub-maskable-512.png',
  '/icons/pothub.svg'
];

function hasSensitiveAuthParams(url) {
  return ['code', 'state', 'auth_ticket', 'ticket', 'auth_code', 'access_token', 'id_token']
    .some(key => url.searchParams.has(key));
}

function isAuthOrApiPath(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/__/auth/') ||
    pathname.startsWith('/auth/') || pathname.startsWith('/login') ||
    pathname.startsWith('/logout') || pathname.startsWith('/oauth/');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Only seed the manifest and fixed icons. Never cache HTML, auth, or API responses.
    await Promise.all(SHELL.map(async path => {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (response.ok && !response.redirected) await cache.put(path, response);
      } catch { /* offline during installation */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadPreviousShell = keys.some(key => key.startsWith('pothub-shell-') && key !== CACHE);
    // Remove all prior PotHub shell caches and any legacy app caches that may
    // contain old Next.js chunks. Hashed Next assets are fetched from network.
    // Remove every previous PotHub-owned cache namespace, including unknown legacy
    // names from older releases. Keep only this build's freshly seeded shell cache.
    await Promise.all(keys.filter(key => key.startsWith('pothub-') && key !== CACHE)
      .map(key => caches.delete(key)));
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/_next/static/') || path.endsWith('.html') || path === '/' || path === '/sw.js') {
          await cache.delete(request);
        }
      }
    }
    await self.clients.claim();
    if (hadPreviousShell) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: 'POTHUB_SW_UPDATED', cache: CACHE, build: BUILD_ID });
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isAuthOrApiPath(url.pathname) || hasSensitiveAuthParams(url)) return;

  if (request.mode === 'navigate') {
    // App pages are deliberately network-only. Never cache a document or
    // replay a stale workspace route when the user returns to Pothub.
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Never serve JavaScript/CSS chunks from Cache Storage. This prevents an
  // old app bundle surviving deployments; Next.js hashed assets are network-only.
  if (url.pathname.startsWith('/_next/static/')) { return; }

  // Only fixed icons are cache-first shell resources.
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !response.redirected) await cache.put(request, response.clone());
      return response;
    })());
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'POTHUB_SKIP_WAITING') self.skipWaiting();
});

// Tapping a PotHub notification focuses the open app (or opens it) and tells it which chat to show.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const chatId = String(event.notification?.data?.chatId || '');
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = clients.find(c => 'focus' in c);
    if (target) { await target.focus(); target.postMessage({ type: 'POTHUB_NOTIFICATION_CLICK', chatId }); return; }
    await self.clients.openWindow('/');
  })());
});
