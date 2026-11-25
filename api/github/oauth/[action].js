// GitHub sign-in for Codelab, running on Vercel. Needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the Vercel project's environment variables.
// Routes: GET /api/github/oauth/start, GET /api/github/oauth/callback, POST /api/github/oauth/exchange, POST /api/github/oauth/revoke
// None of them needs a Pothub sign-in: the state is signed and checked by the browser that started it, and GitHub itself asks the person to log in.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { bodyOf, clientIp, limited, origin, reply } from '../../_lib/http.js';

const secret = () => process.env.GITHUB_CLIENT_SECRET || '';
const callbackUrl = (req) => {
  const set = process.env.GITHUB_CALLBACK_URL || '';
  try { const u = new URL(set); if (u.protocol === 'https:' && !u.username && !u.password && u.pathname.replace(/\/$/, '') === '/api/github/oauth/callback') return u.toString(); } catch { /* use this site */ }
  return `${origin(req)}/api/github/oauth/callback`;
};
const safeError = (e) => { const message = e instanceof Error ? e.message : String(e || 'unknown error'); return message.replace(/(?:ghp_|github_pat_|Bearer\s+)[A-Za-z0-9_\-]+/gi, '[redacted]').slice(0, 180); };

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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  const action = String(req.query?.action || '');
  try {
    if (action === 'start' && req.method === 'GET') {
      if (limited(`gh-start:${clientIp(req)}`, 20)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const missing = [['GITHUB_CLIENT_ID', process.env.GITHUB_CLIENT_ID], ['GITHUB_CLIENT_SECRET', secret()]].filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) return reply(req, res, 503, { error: `GitHub connection needs these Vercel environment variables: ${missing.join(', ')}. Add them, then redeploy.` });
      const cb = callbackUrl(req);
      let callback; try { callback = new URL(cb); } catch { return reply(req, res, 503, { error: 'GitHub callback URL could not be constructed. Set GITHUB_CALLBACK_URL to the exact HTTPS callback route.' }); }
      if (callback.protocol !== 'https:' || callback.pathname.replace(/\/$/, '') !== '/api/github/oauth/callback') return reply(req, res, 503, { error: 'GitHub callback must be HTTPS and end in /api/github/oauth/callback.' });
      const u = new URL('https://github.com/login/oauth/authorize');
      u.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID); u.searchParams.set('redirect_uri', cb);
      u.searchParams.set('scope', 'repo workflow admin:repo_hook'); u.searchParams.set('state', makeState());
      u.searchParams.set('prompt', 'select_account'); // always show GitHub's own account picker / login, even right after a disconnect
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
      if (limited(`gh-exchange:${clientIp(req)}`, 20)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const b = bodyOf(req); const pending = readState(b.state);
      if (typeof b.code !== 'string' || !b.code || !pending) return reply(req, res, 400, { error: 'GitHub authorization expired or was invalid. Tap Connect GitHub again.' });
      if (!process.env.GITHUB_CLIENT_ID || !secret()) return reply(req, res, 503, { error: 'GitHub connection needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the Vercel environment variables.' });
      const r = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: secret(), code: b.code, redirect_uri: callbackUrl(req) }), signal: AbortSignal.timeout(10_000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.access_token) return reply(req, res, 502, { error: d.error_description || 'GitHub did not accept the sign-in. Tap Connect GitHub to try again.' });
      return reply(req, res, 200, { access_token: d.access_token });
    }
    if (action === 'revoke' && req.method === 'POST') {
      // Removes the app's whole authorization on GitHub, so the next Connect shows GitHub's login / authorize page again.
      if (limited(`gh-revoke:${clientIp(req)}`, 20)) return reply(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const token = bodyOf(req).access_token;
      if (typeof token !== 'string' || token.length < 8 || token.length > 400) return reply(req, res, 400, { error: 'Nothing to revoke.' });
      if (!process.env.GITHUB_CLIENT_ID || !secret()) return reply(req, res, 503, { error: 'GitHub revoke needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the Vercel environment variables.' });
      const basic = Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${secret()}`).toString('base64');
      const r = await fetch(`https://api.github.com/applications/${encodeURIComponent(process.env.GITHUB_CLIENT_ID)}/grant`, { method: 'DELETE', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: token }), signal: AbortSignal.timeout(10_000) });
      // 204 = revoked; 404/422 = that token was already gone, which is the outcome we want.
      if (r.status === 204 || r.status === 404 || r.status === 422) return reply(req, res, 200, { revoked: true });
      return reply(req, res, 502, { error: 'GitHub did not confirm the revoke. Remove Pothub at github.com/settings/applications.' });
    }
    return reply(req, res, 404, { error: 'not found' });
  } catch (e) {
    return reply(req, res, 500, { error: `GitHub OAuth endpoint failed: ${safeError(e)}. Check the deployed API route and callback configuration.` });
  }
}
