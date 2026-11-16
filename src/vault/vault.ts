import { Capacitor } from '@capacitor/core';
import { uid } from '../storage/db';

export type ProviderId = 'openai' | 'gemini';
export type KeyStatus = 'untested' | 'ok' | 'invalid' | 'error';
export interface KeyMeta { id: string; provider: ProviderId; label: string; last4: string; createdAt: number; status: KeyStatus; testedAt?: number; }

// Non-secret metadata only. Secrets never touch localStorage.
const META = 'vault.meta';
const readMeta = (): KeyMeta[] => { try { return JSON.parse(localStorage.getItem(META) ?? '[]'); } catch { return []; } };
const writeMeta = (m: KeyMeta[]) => localStorage.setItem(META, JSON.stringify(m));

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

export const listKeys = (): KeyMeta[] => readMeta().sort((a, b) => b.createdAt - a.createdAt);
export const storageKind = () => (Capacitor.isNativePlatform() ? 'Android Keystore secure storage' : 'browser Web Crypto (AES-GCM)');

export async function addKey(provider: ProviderId, label: string, secret: string): Promise<KeyMeta> {
  const s = secret.trim();
  if (s.length < 16) throw new Error('That key looks too short. Paste the full key from your provider.');
  const meta: KeyMeta = { id: uid(), provider, label: label.trim() || 'My key', last4: s.slice(-4), createdAt: Date.now(), status: 'untested' };
  await backend().set(meta.id, s);
  writeMeta([...readMeta(), meta]);
  return meta;
}
export async function removeKey(id: string) { await backend().remove(id).catch(() => {}); writeMeta(readMeta().filter((k) => k.id !== id)); }
export const getSecret = (id: string) => backend().get(id);
export function setStatus(id: string, status: KeyStatus) { writeMeta(readMeta().map((k) => (k.id === id ? { ...k, status, testedAt: Date.now() } : k))); }
export const usableKey = (p: ProviderId) => listKeys().find((k) => k.provider === p && k.status !== 'invalid');
