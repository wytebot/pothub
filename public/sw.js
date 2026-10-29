const CACHE = 'pothub-shell-v6';
// Replaced at build time so every deployment prompts an update in existing clients.
const BUILD_ID = '__POTHUB_BUILD_ID__';
const SHELL = [
  '/',
  '/index.html',
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
    // Only seed the offline shell and fixed icons. Never cache auth/API responses.
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
    await Promise.all(keys.filter(key => key.startsWith('pothub-shell-') && key !== CACHE)
      .map(key => caches.delete(key)));
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
    // Always prefer the live deployment. Never substitute a cached shell for an
    // OAuth return or a failed navigation carrying authentication parameters.
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok && !response.redirected && url.pathname === '/' && !url.search) {
          const copy = response.clone();
          const cache = await caches.open(CACHE);
          await cache.put('/', copy);
          await cache.put('/index.html', copy.clone());
        }
        return response;
      } catch (error) {
        if (url.search || url.pathname !== '/') throw error;
        const cached = await caches.match('/index.html') || await caches.match('/');
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Next.js static assets are content-hashed; icons are immutable shell resources.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
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
