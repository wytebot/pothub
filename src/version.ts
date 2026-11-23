import { Capacitor } from '@capacitor/core';

/** Makes sure nobody keeps running an old copy of the app. Every build has an id; the server publishes the newest id in /version.json. */
export const UPDATE_READY = 'app:update-ready';
const GUARD = 'app.reloaded.for';
const born = Date.now();

async function latest(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json() as { id?: string }; return typeof j.id === 'string' ? j.id : null;
  } catch { return null; }
}

/** Forgets every cached copy of the app and loads the new one. */
export async function applyUpdate(id?: string): Promise<void> {
  try { if (id) sessionStorage.setItem(GUARD, id); } catch { /* storage blocked */ }
  try { for (const k of await caches.keys()) if (k.startsWith('pothub-')) await caches.delete(k); } catch { /* no cache API */ }
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.update(); } catch { /* no service worker */ }
  location.reload();
}

async function check(quiet: boolean) {
  const id = await latest();
  if (!id || id === __BUILD_ID__) return;
  if (sessionStorage.getItem(GUARD) === id) return; // already reloaded once for this version: never loop
  // Just opened (or coming back to the app): switch right away. Mid-use: ask, so a running answer is never cut off.
  if (!quiet || Date.now() - born < 8_000) void applyUpdate(id);
  else window.dispatchEvent(new CustomEvent(UPDATE_READY, { detail: { id } }));
}

export function watchForNewVersion() {
  if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !location.protocol.startsWith('http')) return; // the Android app ships its own files
  void check(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(true); });
  window.setInterval(() => { if (document.visibilityState === 'visible') void check(true); }, 10 * 60_000);
  if ('serviceWorker' in navigator) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) void check(true); });
  }
}
