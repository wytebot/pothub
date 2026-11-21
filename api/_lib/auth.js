// Verifies a Firebase ID token without firebase-admin: RS256 signature against Google's public keys, plus audience, issuer and expiry.
import { createPublicKey, verify } from 'node:crypto';

const KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cache = { keys: [], at: 0 };
const projectId = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pothub-ca2a1';
const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

async function keys(force = false) {
  if (!force && cache.keys.length && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch(KEYS_URL, { signal: AbortSignal.timeout(6_000) });
  if (!r.ok) throw new Error('keys unavailable');
  cache = { keys: (await r.json()).keys || [], at: Date.now() };
  return cache.keys;
}

export async function verifyIdToken(authorization) {
  const m = /^Bearer (.+)$/.exec(String(authorization || '')); if (!m) return null;
  const [h, p, s] = m[1].split('.'); if (!h || !p || !s) return null;
  try {
    const head = json(h); if (head.alg !== 'RS256' || !head.kid) return null;
    let jwk = (await keys()).find((k) => k.kid === head.kid);
    if (!jwk) jwk = (await keys(true)).find((k) => k.kid === head.kid);
    if (!jwk) return null;
    if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))) return null;
    const c = json(p); const now = Date.now() / 1000; const id = projectId();
    if (c.aud !== id || c.iss !== `https://securetoken.google.com/${id}` || !c.sub || !(c.exp > now - 5) || c.iat > now + 300) return null;
    return { uid: String(c.sub), email: typeof c.email === 'string' ? c.email : null };
  } catch { return null; }
}
