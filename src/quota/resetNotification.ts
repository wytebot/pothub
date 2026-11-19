import { Capacitor } from '@capacitor/core';
import { notifyPermission, notifyWanted } from '../notify';
const KEY = 'pothub.quota-reset-notifications.v1';
const timers = new Map<string, number>();
function schedules(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, number>; } catch { return {}; } }
function save(map: Record<string, number>) { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* optional persistence */ } }
async function show(title: string, body: string) {
  if (!notifyWanted() || (await notifyPermission()) !== 'granted') return;
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id: 1001, title, body, channelId: 'pothub-jobs', smallIcon: 'ic_stat_pothub' }] });
    } else if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification(title, { body, tag: 'pothub-quota-reset', icon: '/icon-192.png' });
      else new Notification(title, { body, icon: '/icon-192.png' });
    } else if (typeof Notification !== 'undefined') new Notification(title, { body });
  } catch { /* notification failures must not affect quotas */ }
}
export async function scheduleQuotaReset(kind: 'attachments' | 'analysis', at: number) {
  if (!at || !Number.isFinite(at)) return;
  if (!notifyWanted() || (await notifyPermission()) !== 'granted') return;
  const map = schedules(); map[kind] = at; save(map);
  const old = timers.get(kind); if (old) window.clearTimeout(old);
  const title = kind === 'attachments' ? 'Pothub attachments reset' : 'Pothub file analysis reset';
  const body = kind === 'attachments' ? 'Your free attachment allowance has reset. You can attach files again.' : 'Your free file-analysis allowance has reset. You can analyze files again.';
  if (Capacitor.isNativePlatform()) {
    try { const { LocalNotifications } = await import('@capacitor/local-notifications'); await LocalNotifications.createChannel({ id: 'pothub-jobs', name: 'Pothub notifications', description: 'Usage limit reset reminders', importance: 4, visibility: 1 }); await LocalNotifications.schedule({ notifications: [{ id: kind === 'attachments' ? 1001 : 1002, title, body, schedule: { at: new Date(at) }, channelId: 'pothub-jobs', smallIcon: 'ic_stat_pothub' }] }); } catch { /* app still works without scheduled notifications */ }
  } else {
    timers.set(kind, window.setTimeout(() => { void show(title, body); const latest = schedules(); delete latest[kind]; save(latest); timers.delete(kind); }, Math.max(0, at - Date.now())));
  }
}
/** Re-arm notices after startup. Native scheduling survives app closure; web timers fire while the page is alive. */
export function rearmQuotaNotifications() {
  for (const [kind, at] of Object.entries(schedules())) {
    if (kind !== 'attachments' && kind !== 'analysis') continue;
    if (at <= Date.now()) { void show('Pothub usage limits reset', 'Your free usage limit has reset. You can use files again.'); const map = schedules(); delete map[kind]; save(map); }
    else void scheduleQuotaReset(kind, at);
  }
}
