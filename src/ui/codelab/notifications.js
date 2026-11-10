import { Capacitor } from '@capacitor/core';
import { isAppForeground } from '../../lib/native-ux.js';

const PREF = 'pothub:notifications-enabled';
let lastNativePermission = 'prompt';
const native = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const readPref = () => { try { return localStorage.getItem(PREF) === '1'; } catch { return false; } };
const writePref = value => { try { localStorage.setItem(PREF, value ? '1' : '0'); } catch {} };

export const isMedianApp = () => native();
export const getNotificationPermission = () => {
  if (native()) return lastNativePermission;
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
};
export const refreshNotificationPermission = async () => {
  if (native()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.checkPermissions();
      lastNativePermission = result.display || 'prompt';
      return lastNativePermission;
    } catch { return 'unsupported'; }
  }
  return getNotificationPermission();
};
export const isNotificationsEnabled = () => readPref();

export async function enableNotifications() {
  let permission = 'unsupported';
  if (native()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    let result = await LocalNotifications.checkPermissions();
    if (result.display !== 'granted') result = await LocalNotifications.requestPermissions();
    permission = result.display;
    lastNativePermission = permission;
  } else if (typeof Notification !== 'undefined') {
    permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked in device settings. Allow PotHub notifications there and retry.'
    : 'This browser or device does not support notifications.');
  writePref(true);
  return true;
}

export async function disableNotifications() {
  writePref(false);
  if (native()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id: 731001 }] });
    } catch {}
  }
  return true;
}

const CHANNEL_ID = 'pothub-replies';
const ASKED = 'pothub:notifications-asked';
const PUSH_TOKEN = 'pothub:push-token';
const idFor = (key) => { let h = 7; for (const c of String(key || 'pothub')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 731100 + (h % 90000); };
const plain = (t, n = 140) => String(t || '').replace(/```[\s\S]*?```/g, ' code ').replace(/[#*_`>\[\]()~|-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export async function showPotHubNotification(title, body, id = 731001, extra = {}) {
  if (!readPref()) return false;
  try {
    if (native()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id, title: String(title || 'PotHub'), body: String(body || ''), channelId: CHANNEL_ID, extra, schedule: { at: new Date(Date.now() + 400) } }] });
      return true;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const options = { body: String(body || ''), icon: '/icons/pothub-192.png', badge: '/icons/pothub-192.png', tag: extra.tag || `pothub-${id}`, data: { chatId: extra.chatId || '' } };
      try { const reg = await navigator.serviceWorker?.ready; if (reg?.showNotification) { await reg.showNotification(String(title || 'PotHub'), options); return true; } } catch { /* fall back to the page notification */ }
      new Notification(String(title || 'PotHub'), options);
      return true;
    }
  } catch { /* notifications must never break a reply */ }
  return false;
}

/** Tell the person a reply is ready, but only when they are not looking at PotHub. Returns true when a notification was shown. */
export async function notifyReplyIfAway({ title = 'PotHub replied', text = '', chatId = '', failed = false } = {}) {
  if (isAppForeground() || !readPref()) return false;
  const body = failed ? (plain(text, 120) || 'The request could not be completed. Open PotHub to retry.') : (plain(text) || 'Your response is ready.');
  return showPotHubNotification(failed ? 'PotHub could not finish' : title, body, idFor(chatId || title), { chatId, tag: `chat-${chatId || 'reply'}` });
}

/** Ask for notification permission once, from a user gesture (the first message they send). Never throws, never nags. */
export async function askNotificationsOnce() {
  try {
    if (localStorage.getItem(ASKED)) return readPref();
    localStorage.setItem(ASKED, '1');
    if (readPref()) return true;
    if (!native() && (typeof Notification === 'undefined' || Notification.permission === 'denied')) return false;
    await enableNotifications();
    return true;
  } catch { return false; }
}

const openChat = (chatId) => { if (chatId && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pothub:open-chat', { detail: { chatId } })); };

export async function initNotifications() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'POTHUB_NOTIFICATION_CLICK') openChat(e.data.chatId); });
  if (!native()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    try { await LocalNotifications.createChannel({ id: CHANNEL_ID, name: 'Replies', description: 'When PotHub finishes a response while you are away', importance: 4, visibility: 1, vibration: true }); } catch {}
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const extra = event?.notification?.extra || {};
      if (extra.chatId) openChat(extra.chatId);
      else if (extra.url && typeof window !== 'undefined') window.location.assign(extra.url);
    });
  } catch {}
}

/** Native push (Firebase Cloud Messaging): registers this device so the server can reach it when the app is closed. */
export async function registerPush(api) {
  if (!native() || typeof api !== 'function') return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return false;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', async ({ value }) => {
      try { await api('/api/push/register', { method: 'POST', body: JSON.stringify({ token: value, platform: 'android' }), noRetry: true, timeoutMs: 12000 }); localStorage.setItem(PUSH_TOKEN, value); } catch { /* retried at the next launch */ }
    });
    await PushNotifications.addListener('registrationError', () => {});
    await PushNotifications.addListener('pushNotificationActionPerformed', (event) => { const url = String(event?.notification?.data?.url || ''); if (url.startsWith('chat:')) openChat(url.slice(5)); });
    await PushNotifications.register();
    return true;
  } catch { return false; }
}
export async function unregisterPush(api) {
  try {
    const token = localStorage.getItem(PUSH_TOKEN);
    if (token && typeof api === 'function') await api('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token }), noRetry: true, timeoutMs: 8000 });
    localStorage.removeItem(PUSH_TOKEN);
  } catch {}
}
