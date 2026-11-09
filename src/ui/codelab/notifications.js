import { Capacitor } from '@capacitor/core';

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

export async function showPotHubNotification(title, body, id = 731001) {
  if (!readPref()) return false;
  if (native()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications: [{ id, title: String(title || 'PotHub'), body: String(body || ''), schedule: { at: new Date(Date.now() + 1000) } }] });
    return true;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(String(title || 'PotHub'), { body: String(body || '') });
    return true;
  }
  return false;
}

export async function initNotifications() {
  if (!native()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.addListener('localNotificationActionPerformed', event => {
      if (event?.notification?.extra?.url && typeof window !== 'undefined') window.location.assign(event.notification.extra.url);
    });
  } catch {}
}
