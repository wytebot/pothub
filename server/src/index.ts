import { createServer, type IncomingMessage } from 'node:http';
import { verifyIdToken } from './identity';
import { distributedLimit } from './securityStore';
import { ddgSearch, parseFresh } from './search';
import { crawlSites } from './crawl';
import { billingConfig, billingStatus, handleWebhook, startCheckout, verifyCheckout } from './billing';

const env = process.env; const PORT = Number(env.PORT ?? 8787); const ORIGIN = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
const ORIGINS = new Set([ORIGIN, 'https://localhost', 'capacitor://localhost', ...String(env.EXTRA_ORIGINS ?? '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean)].filter(Boolean));
const raw = (req: IncomingMessage, max = 12_000) => new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > max) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(chunk); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
const burst = new Map<string, number[]>();
function limit(key: string, max: number) { const now = Date.now(); const times = (burst.get(key) ?? []).filter(t => now - t < 60_000); times.push(now); burst.set(key, times); return times.length > max; }
async function rateLimited(key: string, max: number) { try { if (await distributedLimit(key, max)) return true; } catch { /* process-local fallback if Firestore isn't configured */ } return limit(key, max); }

createServer(async (req, res) => {
  const origin = String(req.headers.origin ?? '');
  const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : ORIGIN, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') return send(204, {});
    if (url.pathname === '/health') return send(200, { status: 'ok', service: 'pothub-text-research' });
    if (url.pathname === '/api/billing/config' && req.method === 'GET') return send(200, billingConfig());
    if (url.pathname === '/api/billing/webhook' && req.method === 'POST') {
      const body = JSON.parse((await raw(req, 20_000)).toString('utf8') || '{}') as Record<string, any>;
      try { await handleWebhook(body, req.headers['verif-hash'] as string | undefined); return send(200, { received: true }); }
      catch (e) { return send(e instanceof Error && e.message === 'Invalid webhook signature.' ? 401 : 400, { error: e instanceof Error ? e.message : 'Webhook rejected.' }); }
    }
    if (url.pathname === '/api/billing/status' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to view billing.' });
      try { return send(200, await billingStatus(who)); } catch { return send(503, { error: 'Billing status is unavailable.' }); }
    }
    if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to purchase Premium.' });
      if (await rateLimited(`billing-checkout:${who.uid}`, 4)) return send(429, { error: 'Too many checkout attempts. Wait a minute and retry.' });
      try { return send(200, await startCheckout(who)); } catch (e) { return send(400, { error: e instanceof Error ? e.message : 'Checkout could not be started.' }); }
    }
    if (url.pathname === '/api/billing/verify' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to verify payment.' });
      if (await rateLimited(`billing-verify:${who.uid}`, 10)) return send(429, { error: 'Too many verification attempts. Wait and retry.' });
      try { const body = JSON.parse((await raw(req, 4_000)).toString('utf8') || '{}') as { transactionId?: unknown; txRef?: unknown }; return send(200, await verifyCheckout(who, body)); }
      catch (e) { return send(400, { error: e instanceof Error ? e.message : 'Payment verification failed.' }); }
    }
    if (url.pathname === '/api/search' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to use web search.' });
      if (await rateLimited(`search:${who.uid}`, 30)) return send(429, { error: 'Too many searches. Wait a moment.' });
      const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (q.length < 2) return send(400, { error: 'Type something to search for.' });
      try { return send(200, { results: await ddgSearch(q, 8, parseFresh(url.searchParams.get('fresh'))) }); } catch { return send(502, { error: 'Web search is busy right now. Try again shortly.' }); }
    }
    if (url.pathname === '/api/crawl' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to crawl pages.' });
      if (await rateLimited(`crawl:${who.uid}`, 12)) return send(429, { error: 'Too many crawl requests. Wait a moment.' });
      const body = JSON.parse((await raw(req)).toString('utf8') || '{}') as { urls?: unknown; query?: unknown; depth?: unknown };
      const urls = Array.isArray(body.urls) ? body.urls.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
      if (!urls.length) return send(400, { error: 'Provide at least one web URL to crawl.' });
      const query = typeof body.query === 'string' ? body.query.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
      return send(200, await crawlSites(urls, { query, depth: body.depth === 1 ? 1 : 2, maxPages: 11 }));
    }
    return send(404, { error: 'not found' });
  } catch (e) {
    if (e instanceof SyntaxError) return send(400, { error: 'Invalid request.' });
    console.error('research api request failed'); return send(500, { error: 'Something went wrong.' });
  }
}).listen(PORT, () => console.log(`Pothub text research API on :${PORT}`));
