import crypto from 'node:crypto';

export const config = { api: { bodyParser: false, externalResolver: true } };

function origin(req) {
  const configured = String(process.env.APP_URL || '').trim();
  if (configured) { try { const u = new URL(configured); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) return u.origin; } catch {} }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw new Error('Cannot determine the Pothub API host.');
  return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`;
}
function front(req, params = {}) {
  let target;
  try { target = new URL(String(process.env.FRONTEND_URL || origin(req))); } catch { target = new URL(origin(req)); }
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) target = new URL(origin(req));
  target.pathname = '/'; target.search = ''; target.hash = '';
  for (const [key, value] of Object.entries(params)) if (value != null) target.searchParams.set(key, String(value));
  return target.toString();
}
function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.setHeader('Cache-Control', 'no-store'); res.end(); }
// Keep OAuth state signing on Node's built-in crypto APIs. This avoids a dynamic
// crypto/session helper import becoming a hard dependency of the initial redirect.
function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`pothub-github-oauth-v1.${body}`).digest('base64url');
  return `${body}.${signature}`;
}
export default async function githubStart(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const clientId = String(process.env.GITHUB_CLIENT_ID || process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GH_CLIENT_ID || '').trim();
    if (!clientId) throw new Error('GitHub OAuth Client ID is missing. Add GITHUB_CLIENT_ID in Vercel. The client secret is only required after GitHub returns to the callback.');
    const secret = String(process.env.SESSION_SECRET || '');
    if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const native = String(req.query?.native || '') === '1';
    const sealed = signState({ state, verifier, native, createdAt: Date.now() }, secret);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `pothub_oauth_state=${encodeURIComponent(sealed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', `${origin(req)}/api/auth/github/callback`);
    url.searchParams.set('scope', 'repo read:user user:email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return redirect(res, url.toString());
  } catch (error) {
    console.error('[Pothub direct GitHub OAuth start]', String(error?.message || error).slice(0, 200));
    if (String(req.query?.native || '') === '1') return res.status(503).json({ error: error?.message || 'GitHub sign-in is unavailable.' });
    return redirect(res, front(req, { auth_error: error?.message || 'GitHub sign-in could not start.' }));
  }
}
