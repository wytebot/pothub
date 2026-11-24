import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { verifyIdToken } from './identity';
import { distributedLimit } from './securityStore';
import { ddgSearch, parseFresh } from './search';
import { crawlSites } from './crawl';
import { publishCrawl, searchPublisherIndex, removePublisher } from './publisherIndex';
import { cancelJob, jobView, startJob, validate } from './jobs';
import { billingConfig, billingStatus, handleWebhook, startCheckout, verifyCheckout } from './billing';
import { fileQuotaStatus, consumeFileQuota } from './fileQuota';
import { consumeAnalysisQuota } from './analysisQuota';
import { registerPushToken, removePushToken } from './push';

const env = process.env; const PORT = Number(env.PORT ?? 8787); const ORIGIN = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
const ORIGINS = new Set([ORIGIN, 'https://localhost', 'capacitor://localhost', ...String(env.EXTRA_ORIGINS ?? '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean)].filter(Boolean));
const raw = (req: IncomingMessage, max = 12_000) => new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > max) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(chunk); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
const githubStateSecret = () => env.GITHUB_CLIENT_SECRET || '';
const makeGithubState = (uid: string) => { const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 10 * 60_000, nonce: randomUUID() })).toString('base64url'); const sig = createHmac('sha256', githubStateSecret()).update(payload).digest('base64url'); return `${payload}.${sig}`; };
const verifyGithubState = (state: string) => { try { const [payload, sig] = state.split('.'); if (!payload || !sig || !githubStateSecret()) return null; const expected = createHmac('sha256', githubStateSecret()).update(payload).digest(); const actual = Buffer.from(sig, 'base64url'); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null; const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { uid: string; exp: number; nonce: string }; return data.uid && data.exp > Date.now() ? data : null; } catch { return null; } };
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
    if (url.pathname === '/api/github/oauth/start' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again before connecting GitHub.' });
      const clientId = env.GITHUB_CLIENT_ID; const callback = env.GITHUB_CALLBACK_URL;
      const missing = [['GITHUB_CLIENT_ID', clientId], ['GITHUB_CLIENT_SECRET', githubStateSecret()], ['GITHUB_CALLBACK_URL', callback], ['APP_ORIGIN', ORIGIN]].filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) return send(503, { error: `GitHub connection is not set up on the Pothub server yet. Missing server settings: ${missing.join(', ')}.` });
      // Narrow optional environment values before passing them to URLSearchParams.
      if (!clientId || !callback) return send(503, { error: 'GitHub OAuth client ID and callback URL are required.' });
      if (!/^https:\/\//i.test(String(callback))) return send(503, { error: 'GITHUB_CALLBACK_URL must be the full https URL of /api/github/oauth/callback on the Pothub server.' });
      const state = makeGithubState(who.uid);
      const authUrl = new URL('https://github.com/login/oauth/authorize'); authUrl.searchParams.set('client_id', clientId); authUrl.searchParams.set('redirect_uri', callback); authUrl.searchParams.set('scope', 'repo'); authUrl.searchParams.set('state', state);
      return send(200, { authUrl: authUrl.toString() });
    }
    if (url.pathname === '/api/github/oauth/callback' && req.method === 'GET') {
      const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); const oauthError = url.searchParams.get('error');
      if (!ORIGIN) return send(503, { error: 'APP_ORIGIN is not configured.' });
      const redirect = new URL(ORIGIN + '/');
      if (oauthError) { redirect.searchParams.set('github_error', url.searchParams.get('error_description') || oauthError); redirect.hash = '/codelab'; res.writeHead(302, { Location: redirect.toString(), 'Cache-Control': 'no-store' }); return res.end(); }
      if (!code || !state || !verifyGithubState(state)) return send(400, { error: 'GitHub authorization expired or invalid. Return to Codelab and connect again.' });
      redirect.searchParams.set('github_code', code); redirect.searchParams.set('github_state', state); redirect.hash = '/codelab';
      res.writeHead(302, { Location: redirect.toString(), 'Cache-Control': 'no-store' }); return res.end();
    }
    if (url.pathname === '/api/github/oauth/exchange' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to finish connecting GitHub.' });
      const body = JSON.parse((await raw(req, 2_000)).toString('utf8') || '{}') as { code?: unknown; state?: unknown };
      const code = typeof body.code === 'string' ? body.code : ''; const state = typeof body.state === 'string' ? body.state : ''; const pending = verifyGithubState(state);
      if (!code || !pending || pending.uid !== who.uid) return send(400, { error: 'GitHub OAuth state expired or did not match this signed-in account. Reconnect and retry.' });
      const clientId = env.GITHUB_CLIENT_ID; const secret = env.GITHUB_CLIENT_SECRET; const callback = env.GITHUB_CALLBACK_URL;
      if (!clientId || !secret || !callback) return send(503, { error: 'GitHub OAuth credentials are not configured on the server.' });
      const exchange = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: secret, code, redirect_uri: callback }) });
      const data = await exchange.json() as { access_token?: string; error?: string; error_description?: string };
      if (!exchange.ok || !data.access_token) return send(502, { error: data.error_description || 'GitHub token exchange failed. Try connecting again.' });
      return send(200, { access_token: data.access_token });
    }
    if (url.pathname === '/api/billing/webhook' && req.method === 'POST') {
      const body = JSON.parse((await raw(req, 20_000)).toString('utf8') || '{}') as Record<string, any>;
      try { await handleWebhook(body, req.headers['verif-hash'] as string | undefined); return send(200, { received: true }); }
      catch (e) { return send(e instanceof Error && e.message === 'Invalid webhook signature.' ? 401 : 400, { error: e instanceof Error ? e.message : 'Webhook rejected.' }); }
    }
    if (url.pathname === '/api/files/quota' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in to view your file-analysis allowance.' });
      if (await rateLimited(`file-quota-status:${who.uid}`, 60)) return send(429, { error: 'Too many quota status checks. Wait a moment.' });
      try { return send(200, await fileQuotaStatus(who)); } catch { return send(503, { error: 'File-analysis allowance is unavailable. Try again shortly.' }); }
    }
    if (url.pathname === '/api/files/quota/consume' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in before analyzing attachments. Your free allowance is account-based.' });
      if (await rateLimited(`file-quota:${who.uid}`, 30)) return send(429, { error: 'Too many attachment submissions. Wait a moment and retry.' });
      const body = JSON.parse((await raw(req, 2_000)).toString('utf8') || '{}') as { count?: unknown };
      const count = typeof body.count === 'number' ? body.count : 0;
      try { return send(200, await consumeFileQuota(who, count)); }
      catch (e) { const quota = (e as { quota?: unknown }).quota; if (e instanceof Error && e.message === 'FILE_QUOTA_REACHED') return send(429, { error: 'Free file-analysis allowance reached.', quota }); return send(400, { error: e instanceof Error ? e.message : 'Attachment allowance could not be reserved.' }); }
    }
    if (url.pathname === '/api/billing/status' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to view billing.' });
      try { return send(200, await billingStatus(who)); } catch { return send(503, { error: 'Billing status is unavailable.' }); }
    }
    if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to purchase Premium.' });
      if (await rateLimited(`billing-checkout:${who.uid}`, 4)) return send(429, { error: 'Too many checkout attempts. Wait a minute and retry.' });
      try { const body = JSON.parse((await raw(req, 2_000)).toString('utf8') || '{}') as { plan?: unknown }; return send(200, await startCheckout(who, body.plan)); } catch (e) { return send(400, { error: e instanceof Error ? e.message : 'Checkout could not be started.' }); }
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
    if (url.pathname === '/api/publishers/crawl' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in before publishing crawl results.' });
      if (await rateLimited(`publisher-crawl:${who.uid}`, 4)) return send(429, { error: 'Publisher crawls are limited. Try again later.' });
      const body = JSON.parse((await raw(req, 4_000)).toString('utf8') || '{}') as { siteUrl?: unknown; publish?: unknown };
      if (body.publish !== true) return send(400, { error: 'Explicit opt-in is required before sharing crawl excerpts for citations.' });
      if (typeof body.siteUrl !== 'string') return send(400, { error: 'Provide the website URL to crawl.' });
      try {
        const crawled = await crawlSites([body.siteUrl], { depth: 1, maxPages: 8, budgetMs: 9_000 });
        const result = await publishCrawl(who.uid, body.siteUrl, crawled.pages);
        const publicPages = crawled.pages.map(p => ({ url: p.url, finalUrl: p.finalUrl, title: p.title, text: p.text.slice(0, 1800), description: p.description, published: p.published, updated: p.updated }));
        return send(200, { ...result, pages: publicPages });
      } catch (e) { return send(400, { error: e instanceof Error ? e.message : 'Publisher crawl could not be saved.' }); }
    }
    if (url.pathname === '/api/publishers/search' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in to search publisher sources.' });
      if (await rateLimited(`publisher-search:${who.uid}`, 12)) return send(429, { error: 'Publisher source search is temporarily rate limited.' });
      const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 250);
      if (q.length < 3) return send(200, { results: [] });
      return send(200, { results: await searchPublisherIndex(q, 6) });
    }
    if (url.pathname === '/api/publishers/remove' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in before removing publisher content.' });
      const body = JSON.parse((await raw(req, 2_000)).toString('utf8') || '{}') as { host?: unknown };
      return send(200, { removed: typeof body.host === 'string' ? await removePublisher(who.uid, body.host) : false });
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
    if (url.pathname === '/api/push/register' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in to enable remote notifications.' });
      const body = JSON.parse((await raw(req, 4_000)).toString('utf8') || '{}') as { token?: unknown; platform?: unknown };
      if (typeof body.token !== 'string' || body.token.length < 50 || body.token.length > 4_000) return send(400, { error: 'Invalid push token.' });
      await registerPushToken(who.uid, body.token, typeof body.platform === 'string' ? body.platform.slice(0, 30) : 'web'); return send(200, { registered: true });
    }
    if (url.pathname === '/api/push/remove' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in to manage notifications.' });
      const body = JSON.parse((await raw(req, 4_000)).toString('utf8') || '{}') as { token?: unknown };
      if (typeof body.token === 'string') await removePushToken(who.uid, body.token); return send(200, { removed: true });
    }
    if (url.pathname === '/api/jobs' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to run jobs in the background.' });
      if (await rateLimited(`job:${who.uid}`, 12)) return send(429, { error: 'Too many jobs started. Wait a minute and retry.' });
      const input = validate(JSON.parse((await raw(req, 8_000_000)).toString('utf8') || '{}'));
      if (typeof input === 'string') return send(400, { error: input });
      try { await consumeAnalysisQuota(who); } catch (e) { if (e instanceof Error && e.message === 'ANALYSIS_QUOTA_REACHED') return send(429, { error: 'Free background analysis allowance reached (30 per 24-hour inactivity window).', quota: (e as { quota?: unknown }).quota }); throw e; }
      const started = await startJob(who.uid, input); return 'error' in started ? send(started.status, { error: started.error }) : send(202, started);
    }
    if (url.pathname === '/api/jobs/status' && req.method === 'GET') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      if (await rateLimited(`job-status:${who.uid}`, 240)) return send(429, { error: 'Checking too often. Wait a moment.' });
      const view = await jobView(who.uid, String(url.searchParams.get('id') ?? ''), Number(url.searchParams.get('from') ?? 0) || 0);
      return view ? send(200, view) : send(404, { error: 'This job is no longer available.' });
    }
    if (url.pathname === '/api/jobs/cancel' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in again to continue.' });
      const body = JSON.parse((await raw(req, 2_000)).toString('utf8') || '{}') as { id?: unknown };
      return send(200, { cancelled: await cancelJob(who.uid, typeof body.id === 'string' ? body.id : '') });
    }
    if (url.pathname === '/api/engineering/validate' && req.method === 'POST') {
      const who = await verifyIdToken(req.headers.authorization); if (!who) return send(401, { error: 'Sign in before validating a project in the sandbox.' });
      if (await rateLimited(`engineering-sandbox:${who.uid}`, 4)) return send(429, { error: 'Sandbox checks are rate-limited. Wait a minute and retry.' });
      const runner = String(env.ENGINE_RUNNER_URL ?? '').replace(/\/$/, ''); const token = env.ENGINE_RUNNER_TOKEN ?? '';
      if (!runner || !token) return send(503, { error: 'The isolated engineering runner is not configured on the Pothub server. The project ZIP can still be prepared, but execution checks are unavailable.' });
      const body = JSON.parse((await raw(req, 8_500_000)).toString('utf8') || '{}') as { archive?: unknown };
      if (typeof body.archive !== 'string' || !body.archive || body.archive.length > 8_400_000) return send(400, { error: 'A valid project archive is required. The sandbox archive limit is 6 MB.' });
      let response: Response;
      try { response = await fetch(`${runner}/run`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ archive: body.archive }), signal: AbortSignal.timeout(265_000) }); }
      catch { return send(503, { error: 'The isolated sandbox runner is offline or timed out. The reviewed project ZIP is still available; checks were not run.' }); }
      const result = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || !result) return send(response.status >= 400 && response.status < 500 ? response.status : 502, { error: typeof result?.error === 'string' ? result.error : 'The sandbox runner could not validate this project.' });
      return send(200, result);
    }
    return send(404, { error: 'not found' });
  } catch (e) {
    if (e instanceof SyntaxError) return send(400, { error: 'Invalid request.' });
    if (e instanceof Error && e.message === 'Request too large') return send(413, { error: 'This request is too large to run in the background.' });
    console.error('research api request failed'); return send(500, { error: 'Something went wrong.' });
  }
}).listen(PORT, () => console.log(`Pothub text research API on :${PORT}`));
