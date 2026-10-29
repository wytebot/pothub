const BASE = new URL('.', self.registration.scope).pathname;
const CACHE = 'pothub-shell-v6';
const asset = path => `${BASE}${path.replace(/^\//, '')}`;
const SHELL = [asset(''), asset('index.html'), asset('manifest.webmanifest'), asset('icons/pothub-192.png'), asset('icons/pothub-512.png'), asset('icons/pothub-maskable-512.png'), asset('icons/pothub.svg')];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async path => { try { const response = await fetch(path, { cache: 'reload' }); if (response.ok) await cache.put(path, response); } catch {} }));
    try {
      const response = await fetch(asset('index.html'), { cache: 'reload' });
      if (response.ok) {
        await cache.put(asset('index.html'), response.clone());
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)].map(match => match[1]).filter(path => path.includes('/assets/'));
        await Promise.all(assets.map(async path => { try { const item = await fetch(path, { cache: 'reload' }); if (item.ok) await cache.put(path, item); } catch {} }));
      }
    } catch {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(asset('index.html'), response.clone())); return response; }).catch(() => caches.match(asset('index.html')).then(response => response || caches.match(asset('')))));
    return;
  }
  if (url.pathname.startsWith(BASE + 'assets/') || url.pathname.startsWith(BASE + 'icons/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone())); return response; })));
  }
});
