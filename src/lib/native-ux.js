import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

/**
 * Native-feeling behaviour that works the same in a browser tab, an installed PWA and the Capacitor APK.
 * Every call degrades silently where a feature does not exist, so nothing here can break the app.
 */
const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

let foreground = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
/** True while the person is looking at PotHub (tab visible / app in the foreground). */
export const isAppForeground = () => foreground && (typeof document === 'undefined' || document.visibilityState !== 'hidden');

/** Short tactile feedback. Haptics plugin on Android, the Vibration API on browsers that have it, nothing otherwise. */
export async function haptic(kind = 'light') {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'success') return await Haptics.notification({ type: NotificationType.Success });
      if (kind === 'warning') return await Haptics.notification({ type: NotificationType.Warning });
      if (kind === 'error') return await Haptics.notification({ type: NotificationType.Error });
      return await Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(kind === 'error' ? [30, 40, 30] : kind === 'heavy' ? 28 : kind === 'success' ? [10, 30, 10] : 10);
  } catch { /* haptics are a nicety, never an error */ }
}

// Android foreground service: keeps the process (and a running generation) alive while PotHub is in the background.
const KeepAlive = registerPlugin('KeepAlive');
let keepAliveCount = 0;
export async function keepGenerationAlive(on, text = 'Generating your response…') {
  if (!isNative()) return;
  try {
    if (on) { if (keepAliveCount++ === 0) await KeepAlive.start({ title: 'PotHub is working', text }); }
    else if (keepAliveCount > 0 && --keepAliveCount === 0) await KeepAlive.stop();
  } catch { /* APK built before this plugin existed: generation still runs while the app is open */ }
}
export const releaseKeepAlive = async () => { keepAliveCount = 0; if (isNative()) try { await KeepAlive.stop(); } catch {} };

/**
 * Shell wiring: foreground/background tracking, keyboard inset, Android back button (closes sheets first, then walks
 * back through screens, then minimises instead of trapping the user). Returns a cleanup function.
 */
export function initNativeShell({ canGoBack = () => false, goBack = () => {} } = {}) {
  const cleanups = [];
  const onVisibility = () => { foreground = document.visibilityState !== 'hidden'; window.dispatchEvent(new CustomEvent('pothub:app-state', { detail: { active: foreground } })); };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
  document.documentElement.classList.toggle('is-native-app', isNative());
  if (isNative()) {
    CapacitorApp.addListener('appStateChange', ({ isActive }) => { foreground = !!isActive; window.dispatchEvent(new CustomEvent('pothub:app-state', { detail: { active: !!isActive } })); }).then((h) => cleanups.push(() => h.remove())).catch(() => {});
    CapacitorApp.addListener('backButton', () => {
      // Sheets and dialogs listen for pothub:back and cancel it when they handled the press.
      const handled = !window.dispatchEvent(new Event('pothub:back', { cancelable: true }));
      if (handled) return;
      if (canGoBack()) { goBack(); return; }
      CapacitorApp.minimizeApp?.().catch?.(() => {});
    }).then((h) => cleanups.push(() => h.remove())).catch(() => {});
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      const set = (px) => document.documentElement.style.setProperty('--keyboard-inset', `${px}px`);
      Keyboard.addListener('keyboardWillShow', (info) => set(info?.keyboardHeight || 0)).then((h) => cleanups.push(() => h.remove())).catch(() => {});
      Keyboard.addListener('keyboardWillHide', () => set(0)).then((h) => cleanups.push(() => h.remove())).catch(() => {});
    }).catch(() => {});
  } else if (window.visualViewport) {
    // Browsers: expose the on-screen keyboard height the same way so composers can sit above it.
    const vv = window.visualViewport;
    const onResize = () => document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    vv.addEventListener('resize', onResize); vv.addEventListener('scroll', onResize);
    cleanups.push(() => { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize); });
  }
  return () => cleanups.forEach((fn) => { try { fn(); } catch {} });
}

const NO_SWIPE = 'input,textarea,select,pre,code,table,[contenteditable="true"],[data-no-swipe],.cm-editor,.codelab-terminal,canvas';
/**
 * Edge swipe: drag right from the left screen edge to open the menu, drag left anywhere on the open menu area to close it.
 * Ignores gestures that start on horizontally scrollable content, editors and inputs. Touch only, so desktops are unaffected.
 */
export function attachEdgeSwipe({ isOpen, open, close, edge = 24, distance = 64, mobileMax = 760 }) {
  if (typeof window === 'undefined') return () => {};
  let start = null;
  const onStart = (e) => {
    if (window.innerWidth > mobileMax || e.touches.length !== 1) { start = null; return; }
    const t = e.touches[0];
    if (e.target?.closest?.(NO_SWIPE)) { start = null; return; }
    const opening = !isOpen() && t.clientX <= edge, closing = isOpen();
    start = opening || closing ? { x: t.clientX, y: t.clientY, opening } : null;
  };
  const onEnd = (e) => {
    if (!start) return;
    const t = e.changedTouches[0], dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
    const was = start; start = null;
    if (dy > Math.abs(dx) * 0.7) return;
    if (was.opening && dx > distance) { haptic('light'); open(); }
    else if (!was.opening && dx < -distance) { haptic('light'); close(); }
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchend', onEnd, { passive: true });
  return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
}

/** Long-press on any element matching `selector` (touch or mouse hold). Used to copy a message without hunting for a button. */
export function attachLongPress({ selector, onPress, ms = 520 }) {
  if (typeof document === 'undefined') return () => {};
  let timer = null, target = null, moved = false;
  const clear = () => { clearTimeout(timer); timer = null; target = null; };
  const down = (e) => {
    const el = e.target?.closest?.(selector);
    if (!el || e.target.closest('a,button,input,textarea,select,pre,code')) return;
    target = el; moved = false;
    const p = e.touches?.[0] || e;
    el.__lp = { x: p.clientX, y: p.clientY };
    timer = setTimeout(() => { if (target && !moved) { haptic('medium'); onPress(target); } clear(); }, ms);
  };
  const move = (e) => {
    if (!target) return;
    const p = e.touches?.[0] || e, o = target.__lp || { x: 0, y: 0 };
    if (Math.abs(p.clientX - o.x) > 10 || Math.abs(p.clientY - o.y) > 10) { moved = true; clear(); }
  };
  document.addEventListener('touchstart', down, { passive: true });
  document.addEventListener('touchmove', move, { passive: true });
  document.addEventListener('touchend', clear, { passive: true });
  document.addEventListener('touchcancel', clear, { passive: true });
  return () => { clear(); document.removeEventListener('touchstart', down); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', clear); document.removeEventListener('touchcancel', clear); };
}

/**
 * Pull to refresh, tuned to be hard to trigger by accident: the page must already be at the very top, the drag must be
 * mostly vertical, and it needs a long deliberate pull (default 130px of finger travel, damped) before it fires.
 * It is off inside inputs, editors, horizontally scrollable content and anywhere marked data-no-pull.
 */
export function attachPullToRefresh({ onRefresh, enabled = () => true, threshold = 130, cooldownMs = 5000, mobileMax = 760 }) {
  if (typeof document === 'undefined') return () => {};
  let startY = 0, startX = 0, pulling = false, armed = false, busy = false, lastAt = 0, el = null;
  const ensure = () => {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'pull-refresh-pill'; el.setAttribute('aria-hidden', 'true'); el.textContent = '↓';
    document.body.appendChild(el);
    return el;
  };
  const scrollTopOf = (node) => { for (let n = node; n && n !== document.body; n = n.parentElement) { if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n.scrollTop; } return window.scrollY || document.documentElement.scrollTop || 0; };
  const reset = () => { pulling = false; armed = false; if (el) { el.style.transform = 'translate(-50%,-60px)'; el.style.opacity = '0'; el.classList.remove('ready', 'spin'); } };
  const onStart = (e) => {
    if (busy || window.innerWidth > mobileMax || e.touches.length !== 1 || !enabled() || Date.now() - lastAt < cooldownMs) { pulling = false; return; }
    if (e.target?.closest?.(`${NO_SWIPE},[data-no-pull],.modal-backdrop,.info-modal,.sheet,[role="dialog"]`)) { pulling = false; return; }
    if (scrollTopOf(e.target) > 0) { pulling = false; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; pulling = true; armed = false;
  };
  const onMove = (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy * 0.5) { if (dy < -8 || dx > 24) reset(); return; }
    if (scrollTopOf(e.target) > 0) { reset(); return; }
    const travel = Math.min(dy * 0.55, 90);
    const pill = ensure();
    pill.style.opacity = String(Math.min(1, dy / (threshold * 0.7)));
    pill.style.transform = `translate(-50%,${travel - 44}px) rotate(${Math.min(180, dy * 1.2)}deg)`;
    const ready = dy >= threshold;
    if (ready && !armed) haptic('light');
    armed = ready; pill.classList.toggle('ready', ready);
  };
  const onEnd = async () => {
    if (!pulling) return;
    const fire = armed; pulling = false;
    if (!fire) { reset(); return; }
    busy = true; lastAt = Date.now();
    const pill = ensure(); pill.classList.add('spin'); pill.style.transform = 'translate(-50%,24px)';
    haptic('medium');
    try { await onRefresh(); haptic('success'); } catch { haptic('error'); }
    busy = false; reset();
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onEnd, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
  return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); document.removeEventListener('touchcancel', reset); el?.remove(); el = null; };
}
