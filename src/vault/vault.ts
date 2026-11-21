import { Capacitor } from '@capacitor/core';
import { uid } from '../storage/db';
import { checkSecret, fnsOf, isProviderId, splitSecret, type Fn } from '../models/providerInfo';

export type ProviderId = 'openai' | 'gemini' | 'xai' | 'anthropic' | 'deepseek' | 'mistral' | 'groq' | 'openrouter' | 'together';
export type KeyStatus = 'untested' | 'ok' | 'invalid' | 'error';
export interface KeyMeta { id: string; provider: ProviderId; label: string; last4: string; createdAt: number; status: KeyStatus; testedAt?: number;
  /** Functions this key is ticked as a default for, with the time it was ticked (earlier = tried first). The app only ever uses ticked keys. */
  defaults?: Partial<Record<Fn, number>>; }

// Non-secret metadata only. Secrets never touch localStorage.
const META = 'vault.meta';
const allowedProvider = (p: string): p is ProviderId => isProviderId(p);
const writeMeta = (m: KeyMeta[]) => localStorage.setItem(META, JSON.stringify(m.filter((k) => allowedProvider(k.provider))));
const MIGRATED = 'vault.defaults.v1';
const MIGRATED_TEXT = 'vault.defaults.text.v1';
const readMeta = (): KeyMeta[] => {
  let rows: KeyMeta[]; try { rows = JSON.parse(localStorage.getItem(META) ?? '[]'); } catch { return []; }
  if (localStorage.getItem(MIGRATED) && localStorage.getItem(MIGRATED_TEXT)) return rows;
  // One time: keys saved before defaults existed stay in use. Untick them on the AI Providers page if you want fewer.
  if (!localStorage.getItem(MIGRATED)) for (const k of rows) if (!k.defaults) { k.defaults = {}; for (const f of fnsOf(k.provider)) k.defaults[f] = k.createdAt; }
  // One time: Text now covers chat and documents for more providers. The first saved key of each such provider is ticked for Text, once.
  if (!localStorage.getItem(MIGRATED_TEXT)) {
    const done = new Set<ProviderId>();
    for (const k of [...rows].sort((a, b) => a.createdAt - b.createdAt)) {
      if (!fnsOf(k.provider).includes('text') || done.has(k.provider)) continue;
      done.add(k.provider); k.defaults = k.defaults ?? {};
      if (!rows.some((r) => r.provider === k.provider && r.defaults?.text !== undefined)) k.defaults.text = k.createdAt;
    }
  }
  try { writeMeta(rows); localStorage.setItem(MIGRATED, '1'); localStorage.setItem(MIGRATED_TEXT, '1'); } catch { /* storage blocked: try again next time */ }
  return rows;
};

// ---- Browser: AES-GCM with a non-extractable CryptoKey kept in its own IndexedDB ----
function vdb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('studio-vault', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('secrets', { keyPath: 'id' }); r.result.createObjectStore('wrap'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const rq = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function wrapKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await rq<CryptoKey | undefined>(db.transaction('wrap').objectStore('wrap').get('k'));
  if (existing) return existing;
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await rq(db.transaction('wrap', 'readwrite').objectStore('wrap').put(k, 'k'));
  return k;
}
const web = {
  async set(id: string, secret: string) {
    const db = await vdb(); const key = await wrapKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(secret));
    await rq(db.transaction('secrets', 'readwrite').objectStore('secrets').put({ id, iv, data }));
  },
  async get(id: string) {
    const db = await vdb(); const key = await wrapKey(db);
    const row = await rq<{ iv: Uint8Array; data: ArrayBuffer } | undefined>(db.transaction('secrets').objectStore('secrets').get(id));
    if (!row) throw new Error('This key is no longer stored on the device. Remove it and add it again.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv as unknown as BufferSource }, key, row.data));
  },
  async remove(id: string) { const db = await vdb(); await rq(db.transaction('secrets', 'readwrite').objectStore('secrets').delete(id)); },
};

// ---- Android: Keystore-backed secure storage ----
const native = {
  async store() { return (await import('@aparajita/capacitor-secure-storage')).SecureStorage; },
  async set(id: string, secret: string) { await (await this.store()).set(`key.${id}`, secret); },
  async get(id: string) { const v = await (await this.store()).get(`key.${id}`); if (typeof v !== 'string') throw new Error('This key is no longer stored on the device. Remove it and add it again.'); return v; },
  async remove(id: string) { await (await this.store()).remove(`key.${id}`); },
};
const backend = () => (Capacitor.isNativePlatform() ? native : web);
/** Remove provider keys belonging to retired media-generation services from device secure storage. */
export async function purgeLegacyMediaKeys(): Promise<void> {
  let rows: KeyMeta[]; try { rows = JSON.parse(localStorage.getItem(META) ?? '[]') as KeyMeta[]; } catch { return; }
  const legacy = rows.filter((k) => !k || !allowedProvider((k as KeyMeta).provider));
  for (const k of legacy) if (k?.id) await backend().remove(k.id).catch(() => {});
  writeMeta(rows.filter((k) => k && allowedProvider(k.provider)));
}

export const listKeys = (): KeyMeta[] => readMeta().sort((a, b) => b.createdAt - a.createdAt);
export const storageKind = () => (Capacitor.isNativePlatform() ? 'your phone\'s secure storage' : 'your browser\'s encrypted storage');

export async function addKey(provider: ProviderId, label: string, secret: string): Promise<KeyMeta> {
  const s = secret.trim();
  checkSecret(provider, splitSecret(provider, s));
  const rows = readMeta();
  // The first key for a provider becomes its default for every function it can do; later keys start unticked.
  const defaults: Partial<Record<Fn, number>> = {};
  for (const f of fnsOf(provider)) if (!rows.some((k) => k.provider === provider && k.defaults?.[f] !== undefined)) defaults[f] = Date.now();
  const meta: KeyMeta = { id: uid(), provider, label: label.trim() || 'My key', last4: s.slice(-4), createdAt: Date.now(), status: 'untested', defaults };
  await backend().set(meta.id, s);
  writeMeta([...rows, meta]);
  return meta;
}
/** Change the name and/or the secret of a saved key. Ticked defaults are kept. Leave `secret` out to keep the stored secret. */
export async function updateKey(id: string, o: { label?: string; secret?: string }): Promise<KeyMeta> {
  const rows = readMeta(); const cur = rows.find((k) => k.id === id);
  if (!cur) throw new Error('This key could not be found. Reload the page and try again.');
  const s = o.secret?.trim();
  if (s) { checkSecret(cur.provider, splitSecret(cur.provider, s)); await backend().set(id, s); }
  const next: KeyMeta = { ...cur, label: o.label === undefined ? cur.label : (o.label.trim() || cur.label), ...(s ? { last4: s.slice(-4), status: 'untested' as KeyStatus, testedAt: undefined } : {}) };
  writeMeta(rows.map((k) => (k.id === id ? next : k)));
  return next;
}
export async function removeKey(id: string) { await backend().remove(id).catch(() => {}); writeMeta(readMeta().filter((k) => k.id !== id)); }
export const getSecret = (id: string) => backend().get(id);
export function setStatus(id: string, status: KeyStatus) { writeMeta(readMeta().map((k) => (k.id === id ? { ...k, status, testedAt: Date.now() } : k))); }

// ---- Defaults: the only keys the app routes through ----
export const isDefaultFor = (k: KeyMeta, f: Fn) => k.defaults?.[f] !== undefined;
export function setDefault(id: string, f: Fn, on: boolean) {
  writeMeta(readMeta().map((k) => {
    if (k.id !== id || !fnsOf(k.provider).includes(f)) return k;
    const d = { ...k.defaults }; if (on) d[f] = d[f] ?? Date.now(); else delete d[f];
    return { ...k, defaults: d };
  }));
}
/** Default keys for one function, in the order they are tried. `skip` holds key ids that already failed in this run. Rejected keys are left out. */
export function defaultKeys(f: Fn, skip?: ReadonlySet<string>): KeyMeta[] {
  return readMeta().filter((k) => k.status !== 'invalid' && k.defaults?.[f] !== undefined && !skip?.has(k.id)).sort((a, b) => a.defaults![f]! - b.defaults![f]!);
}
/** The default key to use for `provider`. With a function it is that function's first untried default. Without one it is any default of that provider. */
export function usableKey(p: ProviderId, f?: Fn, skip?: ReadonlySet<string>): KeyMeta | undefined {
  if (f) return defaultKeys(f, skip).find((k) => k.provider === p);
  return readMeta().filter((k) => k.provider === p && k.status !== 'invalid' && !skip?.has(k.id) && Object.keys(k.defaults ?? {}).length > 0).sort((a, b) => a.createdAt - b.createdAt)[0];
}
