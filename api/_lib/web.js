// Safe page fetching, ownership-tag checking and light text extraction for the site tools.
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const META_NAME = 'pothub-site-verification';
export const hostKey = (h) => String(h).toLowerCase().replace(/^www\./, '');

/** True for any address that is not on the public internet. */
export function isPrivateAddress(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2002:')) return true;
    const mapped = /^::ffff:(.+)$/.exec(s);
    if (mapped) {
      const t = mapped[1];
      if (t.includes('.')) return isPrivateAddress(t);
      const h = t.split(':').map((x) => parseInt(x, 16));
      if (h.length === 2 && h.every(Number.isFinite)) return isPrivateAddress(`${h[0] >> 8}.${h[0] & 255}.${h[1] >> 8}.${h[1] & 255}`);
      return true;
    }
    return false;
  }
  return true;
}

const lookupAll = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** The URL if it is a public http/https page on a standard port, else null. */
export async function safeUrl(raw, resolve = lookupAll) {
  let u; try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(local|localhost|internal|lan|home|corp)$/.test(host)) return null;
  try { const addrs = isIP(host) ? [host] : await resolve(host); if (!addrs.length || addrs.some(isPrivateAddress)) return null; } catch { return null; }
  u.hash = ''; return u;
}

async function readCapped(r, max) {
  const dec = new TextDecoder('utf-8');
  if (!r.body) return dec.decode(new TextEncoder().encode((await r.text()).slice(0, max)));
  const reader = r.body.getReader(); const parts = []; let n = 0;
  try { while (n < max) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; } } catch { /* keep what arrived */ }
  try { await reader.cancel(); } catch { /* already closed */ }
  const all = new Uint8Array(Math.min(n, max)); let at = 0;
  for (const p of parts) { const room = all.length - at; if (room <= 0) break; all.set(p.subarray(0, room), at); at += Math.min(p.length, room); }
  return dec.decode(all);
}

/** Fetches one HTML page, following up to 4 redirects and re-checking every hop. */
export async function fetchHtml(raw, { maxBytes = 400_000, budgetMs = 9_000, resolve = lookupAll, fetcher = fetch } = {}) {
  const deadline = Date.now() + budgetMs;
  let url = await safeUrl(raw, resolve);
  for (let hop = 0; url && hop <= 4; hop++) {
    const left = deadline - Date.now(); if (left < 400) return null;
    let r;
    try { r = await fetcher(url.toString(), { headers: { 'User-Agent': 'PothubSiteCheck/1.0 (+https://pothub-self.vercel.app)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' }, redirect: 'manual', signal: AbortSignal.timeout(Math.min(7_000, left)) }); } catch { return null; }
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); if (!loc) return null; try { url = await safeUrl(new URL(loc, url).toString(), resolve); } catch { return null; } continue; }
    if (!r.ok || !/text\/html|application\/xhtml/i.test(r.headers.get('content-type') || '')) return null;
    return { url: url.toString(), body: await readCapped(r, maxBytes) };
  }
  return null;
}

// ---- ownership tag
const secret = () => process.env.SITE_VERIFY_SECRET || process.env.GITHUB_CLIENT_SECRET || '';
/** Stable per account and host; only this signed-in account can obtain it. Nothing is stored, the server recomputes it. */
export function verificationToken(uid, host, key = secret()) {
  if (!key) return null;
  return 'pothub-' + createHmac('sha256', key).update(`site:${uid}:${hostKey(host)}`).digest('hex').slice(0, 32);
}
export const verificationTag = (token) => `<meta name="${META_NAME}" content="${token}">`;
export function hasVerificationTag(html, token) {
  const head = String(html).split(/<\/head\s*>/i)[0] || '';
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const name = /\bname\s*=\s*["']?([^"'\s>]+)/i.exec(m[0])?.[1];
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1];
    if (name?.toLowerCase() === META_NAME && content === token) return true;
  }
  return false;
}

/** Opens the site and confirms this account's tag is in its <head>. Returns { ok:true, page } or { ok:false, status, error }. */
export async function checkSite(uid, rawUrl, opts = {}) {
  const u = await safeUrl(rawUrl, opts.resolve);
  if (!u) return { ok: false, status: 400, error: 'Enter a public http or https website address.' };
  const token = verificationToken(uid, u.hostname, opts.key);
  if (!token) return { ok: false, status: 503, error: 'Site verification needs GITHUB_CLIENT_SECRET or SITE_VERIFY_SECRET in the Vercel environment variables. Add one, then redeploy.' };
  const page = await fetchHtml(u.toString(), opts);
  if (!page) return { ok: false, status: 422, error: 'Pothub could not open this site. Check that the address is correct, public and shows a normal web page.' };
  let finalHost = u.hostname; try { finalHost = new URL(page.url).hostname; } catch { /* keep */ }
  if (hostKey(finalHost) !== hostKey(u.hostname)) return { ok: false, status: 422, error: `This address redirects to ${finalHost}. Add that address as your site and verify it instead.` };
  if (!hasVerificationTag(page.body, token)) return { ok: false, status: 403, error: 'Verification tag not found inside the <head> of this page. Paste the tag in <head>, publish your site, then verify again.' };
  return { ok: true, host: hostKey(u.hostname), page };
}

// ---- reading a page
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return NAMED[e.toLowerCase()] ?? m;
});
const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? decode(m[1] ?? m[2]) : undefined; };

function bodyText(fragment, dropHeader) {
  const gone = dropHeader ? 'script|style|noscript|svg|nav|footer|aside|form|iframe|template|button|select|header' : 'script|style|noscript|svg|nav|footer|aside|form|iframe|template|button|select';
  const t = fragment.replace(new RegExp(`<(${gone})\\b[\\s\\S]*?</\\1>`, 'gi'), ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<h([1-3])\b[^>]*>/gi, '\n\n## ').replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|article|h[1-6]|tr|ul|ol|table|blockquote|header|main)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const out = [];
  for (const l of decode(t).split('\n')) { const x = l.replace(/[ \t\u00a0]+/g, ' ').trim(); if (x.length >= 3 && x !== out[out.length - 1]) out.push(x); }
  return out.join('\n');
}

/** { url, title, description, text } for the diagnosis report. */
export function extractPage(html, url, maxChars = 12_000) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (...keys) => { for (const t of tags) { const k = (attr(t, 'property') ?? attr(t, 'name') ?? '').toLowerCase(); if (keys.includes(k)) { const c = attr(t, 'content')?.trim(); if (c) return c; } } return undefined; };
  let host = ''; try { host = new URL(url).hostname; } catch { /* keep empty */ }
  const title = (meta('og:title', 'twitter:title') ?? strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')) || host;
  const description = meta('description', 'og:description', 'twitter:description');
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0];
  const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]).sort((a, b) => b.length - a.length);
  let text = ''; for (const c of [main, articles[0]]) { if (!c) continue; const t = bodyText(c, false); if (t.length >= 400) { text = t; break; } }
  if (!text) text = bodyText(html.replace(/^[\s\S]*?<body\b[^>]*>/i, ''), true);
  if (text.length > maxChars) text = `${text.slice(0, maxChars).replace(/\s+\S*$/, '')}…`;
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].some((m) => /canonical/i.test(attr(m[0], 'rel') ?? ''));
  return { url, title: title.slice(0, 180), description: description?.slice(0, 300), text: canonical ? `${text}\n\ncanonical url` : text };
}
