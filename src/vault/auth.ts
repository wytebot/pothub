import { Capacitor } from '@capacitor/core';

const WINDOW_MS = 5 * 60_000;
let unlockedAt = 0;
export const isUnlocked = () => Date.now() - unlockedAt < WINDOW_MS;
export const lock = () => { unlockedAt = 0; };
export type AuthResult = { ok: true; note?: string } | { ok: false; reason: string };

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function nativeAuth(): Promise<AuthResult> {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  const info = await BiometricAuth.checkBiometry();
  if (!info.isAvailable && !info.deviceIsSecure) return { ok: false, reason: 'Set up a fingerprint, PIN or pattern in Android settings, then try again. It is needed to protect your keys.' };
  try {
    await BiometricAuth.authenticate({ reason: 'Unlock your AI provider keys', cancelTitle: 'Cancel', allowDeviceCredential: true, androidTitle: 'Unlock keys', androidSubtitle: 'Confirm it is you' });
    return { ok: true };
  } catch { return { ok: false, reason: 'Authentication was cancelled or did not match. Try again.' }; }
}

async function webAuth(): Promise<AuthResult> {
  const available = window.isSecureContext && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false));
  if (!available) return { ok: true, note: 'This browser cannot ask for your fingerprint or device lock here (it needs HTTPS and a screen lock). The page opened without a check.' };
  const challenge = crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource;
  try {
    const stored = localStorage.getItem('vault.cred');
    if (!stored) {
      const cred = (await navigator.credentials.create({ publicKey: {
        challenge, rp: { name: 'Pothub' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)) as unknown as BufferSource, name: 'device-user', displayName: 'This device' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60_000,
      } })) as PublicKeyCredential | null;
      if (!cred) throw new Error('cancelled');
      localStorage.setItem('vault.cred', b64(cred.rawId));
    } else {
      await navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ type: 'public-key', id: unb64(stored) as unknown as BufferSource }], userVerification: 'required', timeout: 60_000 } });
    }
    return { ok: true };
  } catch { return { ok: false, reason: 'Authentication was cancelled or failed. Try again.' }; }
}

/** Gate for the API keys page. This is an access prompt, not encryption. */
export async function unlock(): Promise<AuthResult> {
  if (isUnlocked()) return { ok: true };
  const r = await (Capacitor.isNativePlatform() ? nativeAuth() : webAuth());
  if (r.ok) unlockedAt = Date.now();
  return r;
}
