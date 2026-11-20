import { createServer, type IncomingMessage } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { entitled, luhn, memoryStore, ngnAmount, PRICE_USD, settleCharge, verifySignature, type Plan, type Store } from './billing';
import { verifyIdToken } from './identity';
import { audit, configuredAdmins, distributedLimit, getAccountRole } from './securityStore';
import { validUsageRequest } from './securityPolicy';
import { ddgSearch, parseFresh } from './search';
import { crawlSites } from './crawl';
import { authorizeCharge, FlwError, getCharge, isLive, startCardCharge, toTx, type ChargeResult } from './flutterwave';

const env = process.env; const PORT = Number(env.PORT ?? 8787);
const LICENSE_SECRET = env.LICENSE_SECRET ?? ''; const HASH = env.FLW_SECRET_HASH ?? ''; const ORIGIN = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
// Browser origin(s) plus the Android WebView origins (Capacitor serves the app from https://localhost).
const ORIGINS = new Set([ORIGIN, 'https://localhost', 'capacitor://localhost', ...String(env.EXTRA_ORIGINS ?? '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean)].filter(Boolean));
const STEP = Number(env.PRICE_ROUND_NGN ?? 10); const PENDING_TTL = 60 * 60_000;
const PRO_OVERRIDE_EMAIL = 'ilemobayotolulope11092003@gmail.com';
const isProOverride = (who: { email?: string; emailVerified?: boolean }) => who.emailVerified === true && (who.email ?? '').trim().toLowerCase() === PRO_OVERRIDE_EMAIL;
const configured = () => !!(LICENSE_SECRET && HASH && ORIGIN && env.FLW_CLIENT_ID && env.FLW_CLIENT_SECRET && env.FLW_ENCRYPTION_KEY && (env.FIREBASE_SERVICE_ACCOUNT || env.GOOGLE_APPLICATION_CREDENTIALS));
if (!configured()) console.warn('Checkout stays disabled until LICENSE_SECRET, FLW_SECRET_HASH, APP_ORIGIN, FLW_CLIENT_ID/SECRET, FLW_ENCRYPTION_KEY and Firebase credentials are all set.');
if (!isLive()) console.warn('FLW_ENV is not "production": payments are not real.');

async function makeStore(): Promise<Store> {
  if (!(env.FIREBASE_SERVICE_ACCOUNT || env.GOOGLE_APPLICATION_CREDENTIALS)) { console.warn('No Firebase credentials: in-memory store, development only.'); return memoryStore(); }
  return (await import('./firestoreStore')).firestoreStore();
}
let rate: { v: number; at: number } | null = null;
async function usdNgn(): Promise<number> {
  if (rate && Date.now() - rate.at < 3_600_000) return rate.v;
  const r = await fetch(env.RATE_SOURCE_URL ?? 'https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10_000) }); if (!r.ok) throw new Error('Exchange rate unavailable.');
  const v = Number(((await r.json()) as { rates?: { NGN?: number } }).rates?.NGN); if (!(v > 0)) throw new Error('Exchange rate unavailable.');
  rate = { v, at: Date.now() }; return v;
}
const sign = (k: string) => createHmac('sha256', LICENSE_SECRET).update(k).digest('base64url');
const licenseFor = (k: string) => `${k}.${sign(k)}`;
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function customerFromLicense(h?: string): string | null { const t = (h ?? '').replace(/^Bearer /, ''); const i = t.lastIndexOf('.'); if (i < 1 || !LICENSE_SECRET) return null; const k = t.slice(0, i); return safeEq(t.slice(i + 1), sign(k)) ? k : null; }
const raw = (req: IncomingMessage, max = 100_000) => new Promise<Buffer>((res, rej) => { const c: Buffer[] = []; let n = 0; req.on('data', (d: Buffer) => { n += d.length; if (n > max) { rej(new Error('too large')); req.destroy(); } else c.push(d); }); req.on('end', () => res(Buffer.concat(c))); req.on('error', rej); });
const hits = new Map<string, number[]>();
const limited = (key: string, max: number) => { const now = Date.now(); const h = (hits.get(key) ?? []).filter((t) => now - t < 60_000); h.push(now); hits.set(key, h); return h.length > max; };

const store = await makeStore();
createServer(async (req, res) => {
  const reqOrigin = String(req.headers.origin ?? '');
  const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGINS.has(reqOrigin) ? reqOrigin : ORIGIN, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const ip = (env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'x';
  const json = async (max?: number) => { try { return JSON.parse((await raw(req, max)).toString('utf8') || '{}') as Record<string, any>; } catch { throw new SyntaxError('bad json'); } };
  const logAudit = async (uid: string | null, action: string, meta: Record<string, string | number | boolean | null> = {}) => { try { await audit(uid, action, meta); } catch { console.error('security audit persistence failed'); } };

  /** Verifies the caller owns this payment, then maps a charge to what the app should show next. */
  const reply = async (pendingTx: string, c: ChargeResult, claim?: string) => {
    if (c.next === 'pin' || c.next === 'otp' || c.next === 'redirect' || c.next === 'address' || c.next === 'unsupported') return { state: c.next, txRef: pendingTx, claim, redirectUrl: c.redirectUrl };
    if (c.status === 'pending') return { state: 'pending', txRef: pendingTx, claim };
    const pend = await store.getPending(pendingTx);
    const r = await settleCharge(store, toTx(c));
    if (r.result === 'applied') await logAudit(pend?.ownerUid ?? null, 'billing.payment_settled', { plan: pend?.plan ?? 'unknown' });
    if (r.result === 'ignored') return { state: 'failed', txRef: pendingTx, reason: r.reason };
    return { state: 'paid', txRef: pendingTx, license: licenseFor((pend?.customerKey ?? r.customerKey)!) };
  };
  const owned = async (b: Record<string, any>) => {
    const p = await store.getPending(String(b.txRef ?? ''));
    if (!p || Date.now() - p.createdAt > PENDING_TTL || !safeEq(sha(String(b.claim ?? '')), p.claimHash)) return null;
    return p;
  };

  try {
    const url = new URL(req.url ?? '/', 'http://x'); const p = url.pathname;
    if (req.method === 'OPTIONS') return send(204, {});
    if (p === '/api/config') return send(200, { checkoutEnabled: configured(), live: isLive(), prices: PRICE_USD });
    if (p === '/api/rates') { if (limited(`rates:${ip}`, 30)) return send(429, { error: 'Too many requests.' }); const r = await usdNgn(); return send(200, { usdNgn: r, monthlyNgn: ngnAmount(PRICE_USD.monthly, r, STEP), annualNgn: ngnAmount(PRICE_USD.annual, r, STEP), asOf: new Date(rate!.at).toISOString(), roundedUpToNearest: STEP }); }

    if (p === '/api/pay/start' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in before purchasing a plan.' });
      if (!who.emailVerified) return send(403, { error: 'Verify your Google account email before purchasing.' });
      if (await distributedLimit(`pay-start:${who.uid}`, 5)) return send(429, { error: 'Too many checkout attempts. Wait a minute and try again.' });
      if (!configured()) return send(503, { error: 'Payments are not configured on this server.' });
      if (limited(`start:${ip}`, 6)) return send(429, { error: 'Too many attempts. Wait a minute and try again.' });
      const b = await json(); const plan = b.plan as Plan; const email = String(b.email ?? '').trim().toLowerCase();
      if (!who.email || who.email.toLowerCase() !== email) return send(403, { error: 'The checkout email must match your signed-in Google account.' });
      const name = String(b.name ?? '').trim().split(/\s+/); const card = b.card ?? {};
      const number = String(card.number ?? '').replace(/\s|-/g, ''); const month = String(card.month ?? '').padStart(2, '0'); const yr = String(card.year ?? ''); const year = yr.length === 4 ? yr.slice(2) : yr; const cvv = String(card.cvv ?? '');
      const phone = String(b.phone ?? '').replace(/\D/g, '').replace(/^0+/, ''); const phoneCode = String(b.phoneCode ?? '234').replace(/\D/g, '');
      if (!['monthly', 'annual'].includes(plan)) return send(400, { error: 'Choose a plan.' });
      if (!/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email)) return send(400, { error: 'Enter a valid email address.' });
      if (name.length < 2 || name.some((n) => !n)) return send(400, { error: 'Enter your first and last name as on the card.' });
      if (phone.length < 7 || phone.length > 12 || !phoneCode || phoneCode.length > 3) return send(400, { error: 'Enter a valid phone number.' });
      if (!luhn(number)) return send(400, { error: 'That card number does not look right. Check it and try again.' });
      if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\d{2}$/.test(year)) return send(400, { error: 'Enter the expiry date as MM/YY.' });
      if (!/^\d{3,4}$/.test(cvv)) return send(400, { error: 'Enter the 3 or 4 digit security code.' });
      const amountNgn = ngnAmount(PRICE_USD[plan], await usdNgn(), STEP);
      if (Number(b.expectedNgn) !== amountNgn) return send(409, { error: 'The naira price changed with the exchange rate. Review the new amount.', amountNgn });
      const linkedKey = await store.getLink(who.uid);
      const existing = linkedKey ? await store.getSub(linkedKey) : await store.findSubByEmail(email);
      if (existing?.email && existing.email.toLowerCase() !== email) return send(403, { error: 'This subscription is linked to a different account.' });
      const customerKey = linkedKey ?? existing?.customerKey ?? randomBytes(12).toString('hex');
      await store.putLink(who.uid, customerKey);
      const txRef = `sub_${plan}_${customerKey}_${randomBytes(6).toString('hex')}`; const claim = randomBytes(24).toString('base64url');
      await store.putPending({ txRef, customerKey, email, plan, amountNgn, claimHash: sha(claim), createdAt: Date.now(), ownerUid: who.uid });
      const c = await startCardCharge({ reference: txRef, amountNgn, email, first: name[0], last: name.slice(1).join(' '), phoneCode, phone, card: { number, month, year, cvv }, redirectUrl: `${ORIGIN}/` });
      await store.putPending({ txRef, customerKey, email, plan, amountNgn, claimHash: sha(claim), createdAt: Date.now(), ownerUid: who.uid, chargeId: c.id });
      return send(200, await reply(txRef, c, claim));
    }
    if (p === '/api/pay/authorize' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      if (await distributedLimit(`pay-authorize:${who.uid}`, 10)) return send(429, { error: 'Too many authorization attempts.' });
      if (limited(`auth:${ip}`, 12)) return send(429, { error: 'Too many attempts. Wait a minute and try again.' });
      const b = await json(); const pend = await owned(b); if (!pend?.chargeId || pend.ownerUid !== who.uid) return send(404, { error: 'This payment was not found or has expired. Start again.' });
      const pin = typeof b.pin === 'string' && /^\d{4,6}$/.test(b.pin) ? b.pin : null; const otp = typeof b.otp === 'string' && /^\d{4,10}$/.test(b.otp) ? b.otp : null;
      if (!pin && !otp) return send(400, { error: 'Enter the digits you were asked for.' });
      return send(200, await reply(pend.txRef, await authorizeCharge(pend.chargeId, pin ? { pin } : { otp: otp! })));
    }
    if (p === '/api/pay/status' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      if (await distributedLimit(`pay-status:${who.uid}`, 30)) return send(429, { error: 'Too many status checks.' });
      if (limited(`status:${ip}`, 40)) return send(429, { error: 'Too many attempts.' });
      const pend = await owned(await json()); if (!pend?.chargeId || pend.ownerUid !== who.uid) return send(404, { error: 'This payment was not found or has expired. If you were charged, contact support with your receipt.' });
      return send(200, await reply(pend.txRef, await getCharge(pend.chargeId)));
    }
    if (p === '/api/subscription/status' || p === '/api/billing/history') {
      const key = customerFromLicense(req.headers.authorization); if (!key) return send(401, { error: 'Invalid license.' });
      if (await distributedLimit(`license-read:${key}`, 90)) return send(429, { error: 'Too many requests.' });
      if (p === '/api/billing/history') return send(200, { payments: await store.listPayments(key) });
      const s = await store.getSub(key); return send(200, { entitled: entitled(s), plan: s?.plan ?? null, status: entitled(s) ? 'active' : s ? 'expired' : 'none', currentPeriodEnd: s?.currentPeriodEnd ?? null });
    }
    if (p === '/api/account/me' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      if (await distributedLimit(`me:${who.uid}`, 90)) return send(429, { error: 'Too many requests.' });
      const customerKey = await store.getLink(who.uid); const sub = customerKey ? await store.getSub(customerKey) : undefined;
      const usage = { image: 0, video: 0, day: new Date().toISOString().slice(0, 10) }; const override = isProOverride(who); const premium = override || entitled(sub);
      return send(200, { uid: who.uid, email: who.email ?? null, role: await getAccountRole(who.uid, configuredAdmins()), plan: override ? 'pro' : premium ? sub?.plan ?? null : null, entitled: premium, proOverride: override, currentPeriodEnd: premium ? sub?.currentPeriodEnd ?? (override ? '2100-01-01T00:00:00.000Z' : null) : null, usage, limits: null });
    }
    if (p === '/api/usage/reserve' && req.method === 'POST') {
      // Kept so older installed apps keep working: image and video creation are unlimited, so this only confirms the sign-in.
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in to use generation features.' });
      const b = await json(); if (!validUsageRequest(b.kind, Number(b.amount ?? 1))) return send(400, { error: 'Invalid usage request.' });
      return send(200, { allowed: true, used: 0, limit: null, remaining: null, premium: true });
    }
    if (p === '/api/search' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to use web search.' });
      if (await distributedLimit(`search-burst:${who.uid}`, 30)) return send(429, { error: 'Too many searches. Wait a moment.' });
      const q = (url.searchParams.get('q') ?? '').replace(/\\s+/g, ' ').trim().slice(0, 300);
      if (q.length < 2) return send(400, { error: 'Type something to search for.' });
      try { return send(200, { results: await ddgSearch(q, 8, parseFresh(url.searchParams.get('fresh'))) }); } catch { return send(502, { error: 'Web search is busy right now. Try again shortly.' }); }
    }
    if (p === '/api/crawl' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to crawl pages.' });
      if (await distributedLimit(`crawl-burst:${who.uid}`, 12)) return send(429, { error: 'Too many crawl requests. Wait a moment.' });
      const b = await json(12_000); const urls = Array.isArray(b.urls) ? b.urls.filter((x: unknown): x is string => typeof x === 'string').slice(0, 8) : [];
      if (!urls.length) return send(400, { error: 'Provide at least one web URL to crawl.' });
      const query = typeof b.query === 'string' ? b.query.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
      // Top results, then a few relevant pages from the same sites and each site's newest feed items, all within one time budget.
      return send(200, await crawlSites(urls, { query, depth: b.depth === 1 ? 1 : 2, maxPages: 11 }));
    }
    if (p === '/api/account/link' && req.method === 'POST') {
      if (limited(`link:${ip}`, 20)) return send(429, { error: 'Too many attempts.' });
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      if (!who.emailVerified) return send(403, { error: 'Verify your Google account email before linking a subscription.' });
      if (await distributedLimit(`account-link:${who.uid}`, 10)) return send(429, { error: 'Too many account-link attempts.' });
      const key = customerFromLicense(String((await json()).license ?? '')); if (!key) return send(400, { error: 'That licence was not recognised.' });
      const sub = await store.getSub(key); if (!sub || !who.email || sub.email?.toLowerCase() !== who.email.toLowerCase()) return send(403, { error: 'This licence does not belong to the signed-in account.' });
      const prior = await store.getLink(who.uid); if (prior && prior !== key) return send(409, { error: 'This account is already linked to a different subscription.' });
      await store.putLink(who.uid, key); await logAudit(who.uid, 'account.license_linked'); return send(200, { linked: true });
    }
    if (p === '/api/account/license') {
      if (limited(`acct:${ip}`, 30)) return send(429, { error: 'Too many attempts.' });
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      if (await distributedLimit(`account-license:${who.uid}`, 20)) return send(429, { error: 'Too many requests.' });
      const key = await store.getLink(who.uid); if (!key) return send(404, { error: 'No licence is saved to this account.' });
      return send(200, { license: licenseFor(key) });
    }
    if (p === '/webhooks/flutterwave' && req.method === 'POST') {
      const body = await raw(req); if (!HASH || !verifySignature(body, req.headers['flutterwave-signature'] as string | undefined, HASH)) return send(401, { error: 'bad signature' });
      const ev = JSON.parse(body.toString('utf8')) as { type?: string; data?: { id?: string } }; const id = ev.data?.id;
      if (String(ev.type ?? '').startsWith('charge.') && id) { const result = await settleCharge(store, toTx(await getCharge(id))); await logAudit(null, 'billing.webhook_processed', { result: result.result }); return send(200, result); } // re-fetched from Flutterwave; the webhook body is never trusted
      return send(200, { ignored: true });
    }
    send(404, { error: 'not found' });
  } catch (e) {
    // Never log request bodies or provider exception messages: they may contain card data or credentials.
    console.error('request failed:', e instanceof FlwError ? `provider status ${e.status}` : e instanceof SyntaxError ? 'invalid request' : 'internal error');
    if (e instanceof FlwError && e.status === 422) return send(422, { error: 'The card details could not be processed. Check them and try again.' });
    if (e instanceof FlwError && e.status >= 400 && e.status < 500) return send(402, { error: 'The payment provider declined this request. Check the details or try another card.' });
    send(e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'Invalid request.' : 'Something went wrong.' });
  }
}).listen(PORT, () => console.log(`billing server on :${PORT}`));
