// Stale-client detection. Prefer deployment IDs on Vercel and commit SHAs for
// locally built Capacitor bundles, so a native build does not compare unlike IDs.
export const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || '';
export const CLIENT_DEPLOYMENT = process.env.NEXT_PUBLIC_DEPLOYMENT_ID || '';
export const CLIENT_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
export function isNativeApp() { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } }
export function isStaleBuild(serverBuild, clientBuild = CLIENT_BUILD) {
  const server = String(serverBuild || '').trim(), client = String(clientBuild || '').trim();
  return !!server && !!client && server !== client;
}
export async function fetchServerBuild() {
  try {
    const response = await fetch(`${API_BASE}/api/version?check=${encodeURIComponent(CLIENT_BUILD)}-${Date.now()}`, {
      cache: 'no-store', credentials: 'omit', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!response.ok) return '';
    const data = await response.json().catch(() => ({}));
    // Match identifiers from the same namespace: deployment vs deployment, or commit vs commit.
    return String(CLIENT_DEPLOYMENT ? (data?.deployment || data?.build || '') : (data?.commit || data?.build || ''));
  } catch { return ''; }
}
// At most one automatic reload per server build, so a CDN lag can never loop forever.
export function mayAutoReload(serverBuild) {
  try { return sessionStorage.getItem('pothub-build-reload') !== String(serverBuild); } catch { return false; }
}
export function markAutoReload(serverBuild) { try { sessionStorage.setItem('pothub-build-reload', String(serverBuild)); } catch {} }
export async function hardRefresh() {
  try { if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(reg => reg.update().catch(() => {}))); } } catch {}
  try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.filter(key => key.startsWith('pothub-')).map(key => caches.delete(key))); } } catch {}
  window.location.reload();
}
