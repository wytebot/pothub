import { Capacitor } from '@capacitor/core';

/**
 * Native "your job finished" notifications.
 * They are only shown while the person is NOT looking at Pothub (tab hidden, window in the background, or the Android app
 * backgrounded). In the foreground the result already appears on screen, so nothing pops up.
 * Android app: system notifications through @capacitor/local-notifications. Web / installed PWA: the service worker.
 */
export type NotifyKind = 'text';
export interface NotifyInput { kind: NotifyKind; title: string; body: string; /** hash route to open when tapped, e.g. '/video' */ route?: string; }

const PREF = 'notify.enabled';
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
export async function enableNotifications(): Promise<NotifyPermission> {
  if (!supported()) return 'unsupported';
  let result: NotifyPermission;
  if (native) {
    try { const { LocalNotifications } = await import('@capacitor/local-notifications'); const r = await LocalNotifications.requestPermissions(); result = r.display === 'granted' ? 'granted' : 'denied'; }
    catch { result = 'unsupported'; }
  } else result = (await Notification.requestPermission()) as NotifyPermission;
  setWanted(result === 'granted');
  return result;
}
export const disableNotifications = () => setWanted(false);

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
      } catch { /* plugin not installed in this build */ }
    })();
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => { if (e.data?.type === 'notify-open') open(e.data.route); });
  }
}
