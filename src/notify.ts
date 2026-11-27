import { Capacitor } from '@capacitor/core';
import { app } from './firebase';
import { request } from './security/api';

/**
 * Native "your job finished" notifications.
 * They are only shown while the person is NOT looking at MonyGist (tab hidden, window in the background, or the Android app
 * backgrounded). In the foreground the result already appears on screen, so nothing pops up.
 * Android app: system notifications through @capacitor/local-notifications. Web / installed PWA: the service worker.
 */
export type NotifyKind = 'text';
export interface NotifyInput { kind: NotifyKind; title: string; body: string; /** hash route to open when tapped, e.g. '/video' */ route?: string; }

const PREF = 'notify.enabled';
const VAPID = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim();
const TOKEN_KEY = 'notify.fcm.token';
const CHANNEL = 'pothub-jobs';
const native = Capacitor.isNativePlatform();
let appActive = true; // native foreground state (web uses the page's own visibility)
let started = false;

const open = (route?: string) => { if (route) location.hash = route; };
const supported = () => native || (typeof Notification !== 'undefined' && 'serviceWorker' in navigator);
const inApp = () => (native ? appActive : false) || (!native && document.visibilityState === 'visible' && document.hasFocus());

/** Whether the person turned notifications on in Settings. Off until they choose (a permission prompt must come from a tap). */
export const notifyWanted = () => { try { return localStorage.getItem(PREF) === 'on'; } catch { return false; } };
const setWanted = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';
export async function notifyPermission(): Promise<NotifyPermission> {
  if (!supported()) return 'unsupported';
  if (native) {
    try { const { LocalNotifications } = await import('@capacitor/local-notifications'); const r = await LocalNotifications.checkPermissions(); return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'; }
    catch { return 'unsupported'; }
  }
  return Notification.permission as NotifyPermission;
}

/** Call from a tap (Settings switch). Asks the system for permission and remembers the choice. */
async function registerNativePush(): Promise<void> {
  if (!native) return;
  try { const { PushNotifications } = await import('@capacitor/push-notifications'); await PushNotifications.register(); } catch { /* native plugin may not be synced into this build */ }
}
async function enrollRemoteWebPush(): Promise<void> {
  if (native || !VAPID || !('serviceWorker' in navigator)) return;
  try { const reg = await navigator.serviceWorker.register('/sw.js'); const { getMessaging, getToken } = await import('firebase/messaging'); const messaging = getMessaging(app); const token = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: reg }); if (token) { await request('/api/push/register', { token, platform: 'web' }, 20_000); try { localStorage.setItem(TOKEN_KEY, token); } catch { /* token still registered */ } } } catch { /* local notifications remain available while the remote token is unavailable */ }
}
export async function enableNotifications(): Promise<NotifyPermission> {
  if (!supported()) return 'unsupported';
  let result: NotifyPermission;
  if (native) {
    try { const { LocalNotifications } = await import('@capacitor/local-notifications'); const r = await LocalNotifications.requestPermissions(); result = r.display === 'granted' ? 'granted' : 'denied'; }
    catch { result = 'unsupported'; }
  } else result = (await Notification.requestPermission()) as NotifyPermission;
  setWanted(result === 'granted');
  if (result === 'granted') { if (native) await registerNativePush(); else await enrollRemoteWebPush(); }
  return result;
}
export const disableNotifications = () => { setWanted(false); try { const token = localStorage.getItem(TOKEN_KEY); if (token) void request('/api/push/remove', { token }, 10_000).catch(() => undefined); localStorage.removeItem(TOKEN_KEY); } catch { /* preference remains off */ } };

/** Shows a notification for a finished job, but only when the person is away from the app. Never throws. */
export async function notifyDone(n: NotifyInput): Promise<void> {
  try {
    if (!notifyWanted() || inApp() || (await notifyPermission()) !== 'granted') return;
    const tag = `${n.kind}-${Date.now()}`;
    if (native) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2_000_000_000), title: n.title, body: n.body, channelId: CHANNEL, extra: { route: n.route }, smallIcon: 'ic_stat_pothub' }] });
      return;
    }
    const options: NotificationOptions = { body: n.body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { route: n.route } };
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(n.title, options);
    else { const x = new Notification(n.title, options); x.onclick = () => { window.focus(); open(n.route); x.close(); }; }
  } catch { /* a notification must never break a job */ }
}

/** Wires tap handling and the Android channel. Call once at startup. */
export function startNotifications(): void {
  if (started) return; started = true;
  if (native) {
    void (async () => {
      try {
        const [{ App }, { LocalNotifications }] = await Promise.all([import('@capacitor/app'), import('@capacitor/local-notifications')]);
        appActive = (await App.getState()).isActive;
        await App.addListener('appStateChange', ({ isActive }) => { appActive = isActive; });
        await LocalNotifications.createChannel({ id: CHANNEL, name: 'Finished jobs', description: 'Tells you when an answer is ready.', importance: 4, visibility: 1 });
        await LocalNotifications.addListener('localNotificationActionPerformed', (e) => open((e.notification.extra as { route?: string } | undefined)?.route));
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.addListener('registration', async (token) => { try { await request('/api/push/register', { token: token.value, platform: 'android' }, 20_000); localStorage.setItem(TOKEN_KEY, token.value); } catch { /* registration will be retried on next enable */ } });
        await PushNotifications.addListener('registrationError', () => undefined);
        await PushNotifications.addListener('pushNotificationActionPerformed', (e) => open((e.notification.data as { route?: string } | undefined)?.route));
        if (notifyWanted() && (await PushNotifications.checkPermissions()).receive === 'granted') await PushNotifications.register();
      } catch { /* plugin not installed in this build */ }
    })();
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => { if (e.data?.type === 'notify-open') open(e.data.route); });
    if (notifyWanted() && Notification.permission === 'granted') void enrollRemoteWebPush();
  }
}
