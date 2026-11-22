// Pothub backend gateway. Keys stay in this project's environment variables; the app only knows this address.
// Routes: GET /api/agent/info (provider, model, what is missing), POST /api/agent/proxy (forward one chat or model-list request)
import { once } from 'node:events';
import { applyCors, bodyOf, limited, reply } from '../_lib/http.js';
import { verifyIdToken } from '../_lib/auth.js';
import { accessFor, authHeaders, customNames, settings, targetFor, withModel } from '../_lib/agent.js';

export const config = { maxDuration: 60 };
const MAX_BODY = 4_000_000;

// Errors from the gateway itself carry this header so the app can tell them apart from errors the provider sent.
const refuse = (req, res, status, error) => { res.setHeader('X-Pothub-Gateway', '1'); reply(req, res, status, { error }); };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { applyCors(req, res); res.statusCode = 204; return res.end(); }
  const action = String(req.query?.action || '');
  try {
    const who = await verifyIdToken(req.headers.authorization);
    if (!who) return refuse(req, res, 401, 'Sign in again to use this backend.');
    const b = req.method === 'POST' ? bodyOf(req) : {};
    const q = new URL(req.url || '/', 'http://x').searchParams;
    // The app may say which environment variables to read (its owner's own names); else the backend's own settings apply.
    const custom = customNames(action === 'info' ? { provider: q.get('provider_var'), key: q.get('key_var'), model: q.get('model_var'), allowedEmails: q.get('emails_var') } : b.vars);
    const access = accessFor(who, process.env, custom);
    if (!access.ok) return refuse(req, res, access.status, access.error);
    if (limited(`agent:${who.uid}`, 90)) return refuse(req, res, 429, 'Too many requests. Wait a moment and try again.');
    const s = settings(process.env, custom);

    if (action === 'info' && req.method === 'GET') return reply(req, res, 200, { provider: s.provider, model: s.model, ready: s.ready, missing: s.missing, variableNames: s.variableNames });

    if (action === 'proxy' && req.method === 'POST') {
      if (!s.ready) return refuse(req, res, 503, `This backend is missing: ${s.missing.join(', ')}. Add it in the environment variables and redeploy.`);
      const method = String(b.method || 'POST').toUpperCase();
      const target = targetFor(s.provider, b.url, method, s.model);
      if (!target) return refuse(req, res, 400, `That request is not allowed. This backend only forwards ${s.provider} chat and model-list calls.`);
      let payload;
      if (method === 'POST') { payload = JSON.stringify(withModel(s.provider, b.body, s.model)); if (payload.length > MAX_BODY) return refuse(req, res, 413, 'This request is too large for the backend. Send fewer or smaller files.'); }

      const stop = new AbortController(); const timer = setTimeout(() => stop.abort(), 58_000);
      res.on('close', () => { clearTimeout(timer); stop.abort(); });
      let up;
      try { up = await fetch(target, { method, headers: { ...authHeaders(s.provider, s.key), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: payload, signal: stop.signal }); }
      catch { clearTimeout(timer); return refuse(req, res, 502, 'The backend could not reach the provider. Try again shortly.'); }

      res.statusCode = up.status;
      res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
      res.setHeader('Cache-Control', 'no-store, no-transform'); res.setHeader('X-Accel-Buffering', 'no');
      applyCors(req, res);
      try {
        if (up.body) for await (const chunk of up.body) { if (!res.write(chunk)) await once(res, 'drain'); }
      } catch { /* the app disconnected or the provider dropped: the app continues from what it already received */ }
      clearTimeout(timer); return res.end();
    }
    return refuse(req, res, 404, 'not found');
  } catch {
    return refuse(req, res, 500, 'The backend failed unexpectedly. Try again in a moment.');
  }
}
