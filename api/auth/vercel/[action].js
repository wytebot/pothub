// "Sign in with Vercel" for the Repositories page, running on Vercel.
// Needs VERCEL_APP_CLIENT_ID and VERCEL_APP_CLIENT_SECRET (the Vercel App's client id and secret, named as in Vercel's own guide) in the Vercel project's
// environment variables. VERCEL_CLIENT_ID and VERCEL_CLIENT_SECRET are accepted as alternative names.
// The app's Authorization Callback URL in Vercel must be exactly  https://<your domain>/api/auth/vercel/callback
// Routes: GET /api/auth/vercel/start?challenge=…   GET /api/auth/vercel/callback   POST /api/auth/vercel/exchange
//         POST /api/auth/vercel/refresh            POST /api/auth/vercel/revoke
// PKCE: the browser makes the code verifier and keeps it; only the challenge is sent to start. The secret never leaves this function.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { bodyOf, clientIp, limited, origin, reply } from '../../_lib/http.js';

const AUTHORIZE = 'https://vercel.com/oauth/authorize';
const TOKEN = 'https://api.vercel.com/login/oauth/token';
const REVOKE = 'https://api.vercel.com/login/oauth/token/revoke';
const PATH = '/api/auth/vercel/callback';
const id = () => process.env.VERCEL_APP_CLIENT_ID || process.env.VERCEL_CLIENT_ID || '';
const secret = () => process.env.VERCEL_APP_CLIENT_SECRET || process.env.VERCEL_CLIENT_SECRET || '';
const B64URL = /^[A-Za-z0-9_\-]+$/;

const callbackUrl = (req) => {
  const set = process.env.VERCEL_CALLBACK_URL || '';
  try { const u = new URL(set); if (u.protocol === 'https:' && !u.username && !u.password && u.pathname.replace(/\/$/, '') === PATH) return u.toString(); } catch { /* use this site */ }
  return `${origin(req)}${PATH}`;
};
const safeError = (e) => String(e instanceof Error ? e.message : e || 'unknown error').replace(/(?:vca_|vcr_|Bearer\s+|Basic\s+)[A-Za-z0-9_\-=.]+/gi, '[redacted]').slice(0, 180);

function makeState() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 30 * 60_000, nonce: randomUUID() })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
function readState(state) {
  try {
    const [payload, sig] = String(state).split('.'); if (!payload || !sig || !secret()) return null;
    const want = createHmac('sha256', secret()).update(payload).digest(); const got = Buffer.from(sig, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return d.nonce && d.exp > Date.now() ? d : null;
  } catch { return null; }
}
const missing = () => [['VERCEL_APP_CLIENT_ID', id()], ['VERCEL_APP_CLIENT_SECRET', secret()]].filter(([, v]) => !v).map(([k]) => k);
const notConfigured = (req, res) => reply(req, res, 503, { error: `Vercel sign-in needs these Vercel environment variables: ${missing().join(', ')}. Add them, then redeploy.` });

async function tokenCall(params) {
  const r = await fetch(TOKEN, { method: 'POST', body: new URLSearchParams({ client_id: id(), client_secret: secret(), ...params }), signal: AbortSignal.timeout(12_000) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && !!d.access_token, d };
}
const session = (d) => ({ access_token: d.access_token, refresh_token: d.refresh_token || '', expires_in: Number(d.expires_in) || 3600, scope: d.scope || '' });

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  const action = String(req.query?.action || '');
  try {
    if (action === 'start' && req.method === 'GET') {
      if (limited(`vc-start:${clientIp(req)}`, 20)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      if (missing().length) return notConfigured(req, res);
      const challenge = String(req.query?.challenge || '');
      if (challenge.length < 43 || challenge.length > 128 || !B64URL.test(challenge)) return reply(req, res, 400, { error: 'Missing or invalid PKCE challenge.' });
      const cb = callbackUrl(req);
      const u = new URL(AUTHORIZE);
      u.searchParams.set('client_id', id()); u.searchParams.set('redirect_uri', cb); u.searchParams.set('response_type', 'code');
      u.searchParams.set('state', makeState()); u.searchParams.set('code_challenge', challenge); u.searchParams.set('code_challenge_method', 'S256');
      // No "scope": Vercel then uses the scopes switched on in the app's Manage page (asking for one that is off is refused).
      return reply(req, res, 200, { authUrl: u.toString(), callback: cb });
    }
    if (action === 'callback' && req.method === 'GET') {
      const q = new URL(req.url || '/', 'http://x').searchParams;
      const back = new URL('/', new URL(callbackUrl(req)).origin); back.hash = '/deployments';
      const err = q.get('error');
      if (err) back.searchParams.set('vercel_error', q.get('error_description') || err);
      else if (!q.get('code') || !readState(q.get('state'))) back.searchParams.set('vercel_error', 'Vercel authorization expired or was invalid. Tap Connect Vercel to try again.');
      else { back.searchParams.set('vercel_code', q.get('code')); back.searchParams.set('vercel_state', q.get('state')); }
      res.statusCode = 302; res.setHeader('Location', back.toString()); res.setHeader('Cache-Control', 'no-store'); return res.end();
    }
    if (action === 'exchange' && req.method === 'POST') {
      if (limited(`vc-exchange:${clientIp(req)}`, 20)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      if (missing().length) return notConfigured(req, res);
      const b = bodyOf(req);
      if (typeof b.code !== 'string' || !b.code || b.code.length > 600 || !readState(b.state)) return reply(req, res, 400, { error: 'Vercel authorization expired or was invalid. Tap Connect Vercel again.' });
      if (typeof b.verifier !== 'string' || b.verifier.length < 43 || b.verifier.length > 128 || !B64URL.test(b.verifier)) return reply(req, res, 400, { error: 'The sign-in was not started in this browser tab. Tap Connect Vercel again.' });
      const { ok, d } = await tokenCall({ grant_type: 'authorization_code', code: b.code, code_verifier: b.verifier, redirect_uri: callbackUrl(req) });
      if (!ok) return reply(req, res, 502, { error: d.error_description || (d.error ? `Vercel answered: ${d.error}` : 'Vercel did not accept the sign-in. Tap Connect Vercel to try again.') });
      return reply(req, res, 200, session(d));
    }
    if (action === 'refresh' && req.method === 'POST') {
      if (limited(`vc-refresh:${clientIp(req)}`, 40)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      if (missing().length) return notConfigured(req, res);
      const t = bodyOf(req).refresh_token;
      if (typeof t !== 'string' || t.length < 8 || t.length > 600) return reply(req, res, 400, { error: 'Nothing to refresh.' });
      const { ok, d } = await tokenCall({ grant_type: 'refresh_token', refresh_token: t });
      if (!ok) return reply(req, res, 401, { error: 'The Vercel sign-in expired. Tap Connect Vercel again.' });
      return reply(req, res, 200, session(d));
    }
    if (action === 'revoke' && req.method === 'POST') {
      if (limited(`vc-revoke:${clientIp(req)}`, 20)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const token = bodyOf(req).token;
      if (typeof token !== 'string' || token.length < 8 || token.length > 600) return reply(req, res, 400, { error: 'Nothing to revoke.' });
      if (missing().length) return notConfigured(req, res);
      const basic = Buffer.from(`${id()}:${secret()}`).toString('base64');
      const r = await fetch(REVOKE, { method: 'POST', headers: { Authorization: `Basic ${basic}` }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000) });
      // A token that is already gone is the outcome we want.
      if (r.ok || r.status === 400 || r.status === 401) return reply(req, res, 200, { revoked: true });
      return reply(req, res, 502, { error: 'Vercel did not confirm the revoke. Remove Pothub at vercel.com/account/settings/authorization.' });
    }
    return reply(req, res, 404, { error: 'not found' });
  } catch (e) {
    return reply(req, res, 500, { error: `Vercel sign-in endpoint failed: ${safeError(e)}. Check the deployed API route and callback configuration.` });
  }
}
