export interface StorageInfo { usage: number; quota: number; persisted: boolean; supported: boolean; }
export async function getStorageInfo(): Promise<StorageInfo> {
  const s = navigator.storage;
  if (!s?.estimate) return { usage: 0, quota: 0, persisted: false, supported: false };
  const est = await s.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted: (await s.persisted?.()) ?? false, supported: true };
}
export const requestPersistence = async () => (await navigator.storage?.persist?.()) ?? false;
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}
