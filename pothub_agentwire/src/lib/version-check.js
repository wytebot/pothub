// Detects a stale client bundle. The bundle carries the deployment id it was built from; the live server
// reports the current one. They only differ when an old page/chunk survived in memory or a cache.
export const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
export function isNativeApp() { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } }
export function isStaleBuild(serverBuild, clientBuild = CLIENT_BUILD) {
  const server = String(serverBuild || '').trim(), client = String(clientBuild || '').trim();
  return !!server && !!client && server !== client;
}
export async function fetchServerBuild() {
  try {
    const response = await fetch(`${API_BASE}/api/version?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) return '';
    const data = await response.json().catch(() => ({}));
    return String(data?.build || '');
  } catch { return ''; }
}
// At most one automatic reload per server build, so a CDN lag or id mismatch can never cause a reload loop.
export function mayAutoReload(serverBuild) {
  try { return sessionStorage.getItem('pothub-build-reload') !== String(serverBuild); } catch { return false; }
}
export function markAutoReload(serverBuild) { try { sessionStorage.setItem('pothub-build-reload', String(serverBuild)); } catch {} }
export async function hardRefresh() {
  try { if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(reg => reg.update().catch(() => {}))); } } catch {}
  try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.filter(key => key.startsWith('pothub-')).map(key => caches.delete(key))); } } catch {}
  window.location.reload();
}
