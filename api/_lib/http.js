// Shared helpers for the Vercel functions in /api. Files starting with _ are not deployed as routes.
// The Pothub web app and its Android app may call any backend, so a separate backend needs no extra setup.
const NATIVE_ORIGINS = ['https://pothub-self.vercel.app', 'https://localhost', 'capacitor://localhost'];
const host = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '');
export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
export const origin = (req) => `https://${host(req)}`;

function allowedOrigin(req) {
  const o = String(req.headers.origin || '');
  if (!o) return '';
  try { if (new URL(o).host === host(req)) return o; } catch { /* not a URL */ }
  const extra = [process.env.APP_ORIGIN, ...String(process.env.EXTRA_ORIGINS || '').split(',')].map((x) => String(x || '').trim().replace(/\/$/, '')).filter(Boolean);
  return [...NATIVE_ORIGINS, ...extra].includes(o) ? o : '';
}

/** Adds CORS headers when the caller is this site or a known app origin. */
export function applyCors(req, res) {
  const o = allowedOrigin(req);
  res.setHeader('Vary', 'Origin');
  if (o) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Pothub-Guest'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Expose-Headers', 'X-Pothub-Gateway'); }
}

export function reply(req, res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  applyCors(req, res);
  res.end(status === 204 ? '' : JSON.stringify(body));
}

export function bodyOf(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : '{}'); } catch { return {}; }
}

// Best-effort limiter (per warm function instance). It slows abuse; it is not a global quota.
const hits = new Map();
export function limited(key, max) {
  const now = Date.now(); const t = (hits.get(key) || []).filter((x) => now - x < 60_000); t.push(now); hits.set(key, t);
  return t.length > max;
}
