import crypto from 'node:crypto';

const PURPOSE = 'pothub-oauth-state-v1.';
export function signOAuthState(payload, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(PURPOSE + body).digest('base64url');
  return `${body}.${signature}`;
}
export function verifyOAuthState(value, secret, maxAgeMs = 600000) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', secret).update(PURPOSE + parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const age = Date.now() - Number(payload.createdAt || 0);
    if (!Number.isFinite(age) || age < -30000 || age > maxAgeMs) return null;
    return payload;
  } catch { return null; }
}
export function requestOrigin(req) {
  const configured = String(process.env.APP_URL || '').trim();
  if (configured) {
    const url = new URL(configured);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must be an HTTP(S) origin without a path or credentials.');
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS in production.');
    return url.origin;
  }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw new Error('Cannot determine Pothub API host. Set APP_URL in Vercel.');
  return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`;
}
export function frontendUrl(req, params = {}) {
  let url;
  try { url = new URL(String(process.env.FRONTEND_URL || requestOrigin(req))); } catch { url = new URL(requestOrigin(req)); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) url = new URL(requestOrigin(req));
  url.pathname = '/'; url.search = ''; url.hash = '';
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value));
  return url.toString();
}
export function appendCookie(res, value) {
  const existing = res.getHeader('Set-Cookie');
  const rows = existing == null ? [] : Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader('Set-Cookie', [...rows, value]);
}
export function clearCookie(name) { return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
export function stateCookie(name, value) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
export function readCookie(req, name) {
  const item = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return null; }
}
