import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { getNativeSession } from './platform';
import { chooseVerificationMode, nativeEnableMode } from './biometric-policy';

const STORAGE_KEY = 'pothub-api-page-biometric-v1';
const NATIVE_STORAGE_KEY = 'pothub-api-page-biometric-secure-v1';
const browserStorageKey = ownerId => ownerId ? `${STORAGE_KEY}:${String(ownerId)}` : STORAGE_KEY;
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
const fromB64url = value => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
};
const random = (n = 32) => crypto.getRandomValues(new Uint8Array(n));
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const isNative = () => Capacitor.isNativePlatform();
async function settings() { return (await import('./db')).db; }

async function readLock(ownerId) {
  if (isNative()) {
    try {
      const value = await SecureStorage.get(NATIVE_STORAGE_KEY);
      if (value) return JSON.parse(value);
    } catch (error) {
      if (!/not found|missing|does not exist/i.test(String(error?.message || ''))) {
        throw new Error('Android secure storage is unavailable. Update the PotHub app and try again.');
      }
    }
    // One-time migration from the earlier IndexedDB-only native lock record.
    const db = await settings();
    const legacy = await db.settings.get(STORAGE_KEY);
    if (legacy?.value) {
      await SecureStorage.set(NATIVE_STORAGE_KEY, JSON.stringify(legacy.value));
      await db.settings.delete(STORAGE_KEY);
      return legacy.value;
    }
    return null;
  }
  const db = await settings();
  const key = browserStorageKey(ownerId);
  const current = await db.settings.get(key);
  if (current?.value) return current.value;
  // Move the previous device-global browser lock into the first account that
  // uses it. Subsequent accounts receive independent WebAuthn/PIN state.
  if (ownerId && key !== STORAGE_KEY) {
    const legacy = await db.settings.get(STORAGE_KEY);
    if (legacy?.value) {
      await db.settings.put({ key, value: legacy.value });
      await db.settings.delete(STORAGE_KEY);
      return legacy.value;
    }
  }
  return null;
}

async function writeLock(value, ownerId) {
  if (isNative()) {
    await SecureStorage.set(NATIVE_STORAGE_KEY, JSON.stringify(value));
    return;
  }
  const db = await settings();
  await db.settings.put({ key: browserStorageKey(ownerId), value });
}

async function deleteLock(ownerId) {
  if (isNative()) {
    try { await SecureStorage.remove(NATIVE_STORAGE_KEY); } catch (error) {
      if (!/not found|missing|does not exist/i.test(String(error?.message || ''))) throw error;
    }
    const db = await settings();
    await db.settings.delete(STORAGE_KEY);
    return;
  }
  const db = await settings();
  await db.settings.delete(browserStorageKey(ownerId));
  if (ownerId) await db.settings.delete(STORAGE_KEY);
}

async function pinDigest(pin, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, material, 256));
}

async function apiSecurity(path, body) {
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  let token = '';
  try { token = isNative() ? await getNativeSession() : (sessionStorage.getItem('pothub-session-v1') || ''); } catch {}
  const response = await fetch(`${base}/api/security/${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your PotHub session expired. Sign in again, then reopen API & Agents.');
    throw new Error(data.error || 'Security verification failed.');
  }
  return data;
}

function promptPin(message) {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') throw new Error('Passcode entry is unavailable in this environment.');
  return window.prompt(message);
}

async function setupPin(ownerId) {
  const first = promptPin('Set a device passcode (6–12 digits) for API & Agents access.');
  if (first === null) throw new Error('Passcode setup was cancelled.');
  if (!/^\d{6,12}$/.test(first)) throw new Error('Use a passcode containing 6–12 digits.');
  const second = promptPin('Confirm your device passcode.');
  if (second !== first) throw new Error('The passcodes did not match.');

  if (!isNative()) {
    await apiSecurity('pin/setup', { pin: first });
    const row = { enabled: true, mode: 'pin', serverVerified: true, createdAt: Date.now(), failures: 0, lockedUntil: 0 };
    await writeLock(row, ownerId);
    return row;
  }

  const salt = random(16);
  const digest = await pinDigest(first, salt);
  const row = { enabled: true, mode: 'pin', salt: b64url(salt), pinHash: b64url(digest), failures: 0, lockedUntil: 0, createdAt: Date.now() };
  await writeLock(row, ownerId);
  return row;
}

async function verifyPin(ownerId) {
  const row = await readLock(ownerId);
  if (!row?.pinHash && !row?.serverVerified) throw new Error('No fallback passcode is configured. Unlock with biometrics, then enable the fallback passcode in API & Agents settings.');
  const now = Date.now();
  if (Number(row.lockedUntil) > now) throw new Error(`Passcode attempts are temporarily paused. Try again in ${Math.ceil((row.lockedUntil - now) / 1000)} seconds.`);
  const pin = promptPin('Enter your API & Agents device passcode.');
  if (pin === null) throw new Error('Verification was cancelled.');
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Enter the 6–12 digit passcode.');

  if (!isNative() && row.serverVerified) {
    await apiSecurity('pin/verify', { pin });
    await writeLock({ ...row, failures: 0, lockedUntil: 0, lastVerifiedAt: now }, ownerId);
    return true;
  }

  const digest = await pinDigest(pin, fromB64url(row.salt));
  if (!equal(digest, fromB64url(row.pinHash))) {
    const failures = (Number(row.failures) || 0) + 1;
    await writeLock({ ...row, failures, lockedUntil: failures >= 5 ? now + 300000 : 0 }, ownerId);
    throw new Error(failures >= 5 ? 'Too many incorrect passcodes. Try again in five minutes.' : 'Incorrect passcode. Try again.');
  }
  await writeLock({ ...row, failures: 0, lockedUntil: 0, lastVerifiedAt: now }, ownerId);
  return true;
}

function credentialJSON(credential) {
  const response = credential.response;
  const out = { id: credential.id, rawId: b64url(credential.rawId), type: credential.type, clientExtensionResults: credential.getClientExtensionResults?.() || {} };
  if (response.attestationObject) out.response = { clientDataJSON: b64url(response.clientDataJSON), attestationObject: b64url(response.attestationObject), transports: response.getTransports?.() || [] };
  else out.response = { clientDataJSON: b64url(response.clientDataJSON), authenticatorData: b64url(response.authenticatorData), signature: b64url(response.signature), userHandle: response.userHandle ? b64url(response.userHandle) : null };
  return out;
}

async function browserRegister(ownerId) {
  const options = await apiSecurity('webauthn/register/options');
  const publicKey = { ...options, challenge: fromB64url(options.challenge), user: { ...options.user, id: fromB64url(options.user.id) }, excludeCredentials: (options.excludeCredentials || []).map(x => ({ ...x, id: fromB64url(x.id) })) };
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error('Device verification setup was cancelled.');
  const result = await apiSecurity('webauthn/register/verify', { response: credentialJSON(credential) });
  const pinRow = await setupPin(ownerId);
  const row = { ...pinRow, id: result.credentialId, createdAt: Date.now(), rpId: location.hostname, enabled: true, mode: 'webauthn', hasPin: true, serverVerified: true };
  await writeLock(row, ownerId);
  return row;
}

async function browserVerify() {
  const options = await apiSecurity('webauthn/auth/options');
  const publicKey = { ...options, challenge: fromB64url(options.challenge), allowCredentials: (options.allowCredentials || []).map(x => ({ ...x, id: fromB64url(x.id) })) };
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error('Device verification was cancelled.');
  await apiSecurity('webauthn/auth/verify', { response: credentialJSON(credential) });
  return true;
}

export async function biometricAvailable() {
  if (isNative()) {
    try {
      const result = await NativeBiometric.isAvailable();
      return { available: !!result?.isAvailable, reason: result?.isAvailable ? '' : 'Biometrics unavailable. You can use a secure device passcode instead.' };
    } catch {
      return { available: false, reason: 'Native biometrics unavailable. You can use a secure device passcode instead.' };
    }
  }
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) return { available: false, reason: 'WebAuthn is unavailable here. You can use a device passcode instead.' };
  try {
    const supported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return { available: supported, reason: supported ? '' : 'No platform authenticator is available. You can use a device passcode instead.' };
  } catch {
    return { available: false, reason: 'This browser cannot access a platform authenticator. You can use a device passcode instead.' };
  }
}

async function nativeVerify() {
  const available = await NativeBiometric.isAvailable();
  if (!available?.isAvailable) throw new Error('Biometric verification is unavailable on this device.');
  await NativeBiometric.verifyIdentity({ reason: 'Unlock PotHub API keys', title: 'Verify identity', subtitle: 'API & Agents', description: 'Confirm it is you to view or change agent settings.', negativeButtonText: 'Use passcode' });
}

export async function verifyApiPage(ownerId) {
  const available = await biometricAvailable();
  const row = await readLock(ownerId);
  const method = chooseVerificationMode({ native: isNative(), mode: row?.mode, available: available.available, hasFallback: !!(row?.pinHash || row?.serverVerified) });
  if (method === 'recovery-required') throw new Error('No fallback passcode is configured. Unlock with your existing authenticator, then enable a fallback passcode.');
  if (method === 'pin') return verifyPin(ownerId);
  if (method === 'native-biometric') {
    try {
      await nativeVerify();
      // Upgrade older native installs that had biometric-only locking.
      if (!row?.pinHash) {
        const fallback = await setupPin(ownerId);
        await writeLock({ ...fallback, enabled: true, mode: 'native', biometricEnabled: true, createdAt: row?.createdAt || Date.now() }, ownerId);
      }
      return true;
    } catch (biometricError) {
      if (row?.pinHash) return verifyPin(ownerId);
      throw new Error(`${biometricError?.message || 'Biometric verification failed.'} No fallback passcode is configured on this older installation. Unlock once with biometrics and set a fallback passcode.`);
    }
  }
  try { return await browserVerify(); }
  catch (error) {
    const row = await readLock(ownerId);
    if (row?.serverVerified) return verifyPin(ownerId);
    throw error;
  }
}

export async function enableApiPageBiometric(ownerId) {
  const available = await biometricAvailable();
  if (!available.available) return setupPin(ownerId);
  if (isNative()) {
    // Always configure a fallback first; a biometric prompt cancellation must
    // never leave the user with a lock they cannot recover from.
    const fallback = await setupPin(ownerId);
    try {
      await nativeVerify();
      const row = { ...fallback, enabled: true, mode: nativeEnableMode({ biometricPromptSucceeded: true }), biometricEnabled: true, createdAt: Date.now() };
      await writeLock(row, ownerId);
      return row;
    } catch {
      // Keep a usable passcode lock if the OS prompt is cancelled or the
      // biometric plugin cannot complete. Do not leave a half-enabled state.
      const row = { ...fallback, enabled: true, mode: nativeEnableMode({ biometricPromptSucceeded: false }), biometricEnabled: false };
      await writeLock(row, ownerId);
      return row;
    }
  }
  return browserRegister(ownerId);
}

export async function disableApiPageBiometric(ownerId) {
  await verifyApiPage(ownerId);
  if (!isNative()) await apiSecurity('lock/disable');
  await deleteLock(ownerId);
  return true;
}

export async function apiPageBiometricEnabled(ownerId) {
  const row = await readLock(ownerId);
  return !!row?.enabled;
}

export async function apiPageBiometricMode(ownerId) {
  const row = await readLock(ownerId);
  return row?.enabled ? String(row.mode || 'pin') : '';
}
