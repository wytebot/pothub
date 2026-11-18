import { onAuthStateChanged } from 'firebase/auth';
import { apiConfigured, linkLicenseToAccount, restoreLicenseFromAccount, storedLicense, verifyLicense } from '../billing/api';
import { auth } from '../firebase';
import { getServerProfile } from '../security/api';
import { idToken } from './session';

/**
 * Keeps the premium licence tied to the signed-in Google account:
 *  - signed in with a licence on this device -> save it to the account
 *  - signed in with no licence here          -> restore it from the account
 * Failures are silent: the app works fully without a billing server or account.
 */
let running = false;
export async function syncLicense() {
  if (!apiConfigured || running || !auth.currentUser) return;
  running = true;
  try {
    const token = await idToken(); if (!token) return;
    const local = storedLicense();
    if (local) await linkLicenseToAccount(token, local).catch(() => null);
    else { const r = await restoreLicenseFromAccount(token).catch(() => null); if (r?.license) { await verifyLicense(r.license); window.dispatchEvent(new Event('billing:licensed')); } }
    const profile = await getServerProfile().catch(() => null);
    if (profile) {
      if (profile.entitled && profile.currentPeriodEnd) {
        const until = String(new Date(profile.currentPeriodEnd).getTime());
        localStorage.setItem('billing.entitledUntil', until); localStorage.setItem('billing.lastUntil', until);
      } else localStorage.removeItem('billing.entitledUntil');
      localStorage.setItem(`quota.${profile.usage.day}`, JSON.stringify({ image: profile.usage.image, video: profile.usage.video }));
      window.dispatchEvent(new Event('account:server-sync'));
    }
  } catch { /* offline or server not configured */ } finally { running = false; }
}
export function startAccountSync() {
  onAuthStateChanged(auth, (u) => { if (u) void syncLicense(); });
  window.addEventListener('billing:licensed', () => void syncLicense());
}
