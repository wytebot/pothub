// GitHub sign-in for Codelab, running on Vercel. Needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the Vercel project's environment variables.
// Routes: GET /api/github/oauth/start, GET /api/github/oauth/callback, POST /api/github/oauth/exchange
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { bodyOf, limited, origin, reply } from '../../_lib/http.js';
import { verifyIdToken } from '../../_lib/auth.js';

const secret = () => process.env.GITHUB_CLIENT_SECRET || '';
const callbackUrl = (req) => {
  const set = process.env.GITHUB_CALLBACK_URL || '';
  try { const u = new URL(set); if (u.protocol === 'https:' && u.pathname.replace(/\/$/, '') === '/api/github/oauth/callback') return u.toString(); } catch { /* use this site */ }
  return `${origin(req)}/api/github/oauth/callback`;
};

function makeState(uid) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 10 * 60_000, nonce: randomUUID() })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
function readState(state) {
  try {
    const [payload, sig] = String(state).split('.'); if (!payload || !sig || !secret()) return null;
    const want = createHmac('sha256', secret()).update(payload).digest(); const got = Buffer.from(sig, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return d.uid && d.exp > Date.now() ? d : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  const action = String(req.query?.action || '');
  try {
    if (action === 'start' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization);
      if (!who) return reply(req, res, 401, { error: 'Sign in again before connecting GitHub.' });
      if (limited(`gh-start:${who.uid}`, 10)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const missing = [['GITHUB_CLIENT_ID', process.env.GITHUB_CLIENT_ID], ['GITHUB_CLIENT_SECRET', secret()]].filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) return reply(req, res, 503, { error: `GitHub connection needs these Vercel environment variables: ${missing.join(', ')}. Add them, then redeploy.` });
      const u = new URL('https://github.com/login/oauth/authorize');
      u.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID); u.searchParams.set('redirect_uri', callbackUrl(req));
      u.searchParams.set('scope', 'repo'); u.searchParams.set('state', makeState(who.uid));
      return reply(req, res, 200, { authUrl: u.toString() });
    }
    if (action === 'callback' && req.method === 'GET') {
      const q = new URL(req.url || '/', 'http://x').searchParams;
      const back = new URL('/', new URL(callbackUrl(req)).origin); back.hash = '/codelab';
      const err = q.get('error');
      if (err) back.searchParams.set('github_error', q.get('error_description') || err);
      else if (!q.get('code') || !readState(q.get('state'))) back.searchParams.set('github_error', 'GitHub authorization expired or was invalid. Tap Connect GitHub to try again.');
      else { back.searchParams.set('github_code', q.get('code')); back.searchParams.set('github_state', q.get('state')); }
      res.statusCode = 302; res.setHeader('Location', back.toString()); res.setHeader('Cache-Control', 'no-store'); return res.end();
    }
    if (action === 'exchange' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization);
      if (!who) return reply(req, res, 401, { error: 'Sign in again to finish connecting GitHub.' });
      const b = bodyOf(req); const pending = readState(b.state);
      if (typeof b.code !== 'string' || !b.code || !pending || pending.uid !== who.uid) return reply(req, res, 400, { error: 'GitHub authorization expired or did not match this account. Tap Connect GitHub again.' });
      if (!process.env.GITHUB_CLIENT_ID || !secret()) return reply(req, res, 503, { error: 'GitHub connection needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the Vercel environment variables.' });
      const r = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: secret(), code: b.code, redirect_uri: callbackUrl(req) }), signal: AbortSignal.timeout(10_000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.access_token) return reply(req, res, 502, { error: d.error_description || 'GitHub did not accept the sign-in. Tap Connect GitHub to try again.' });
      return reply(req, res, 200, { access_token: d.access_token });
    }
    return reply(req, res, 404, { error: 'not found' });
  } catch {
    return reply(req, res, 500, { error: 'GitHub connection failed unexpectedly. Try again in a moment.' });
  }
}
