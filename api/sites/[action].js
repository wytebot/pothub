// Site ownership check and diagnosis, running on Vercel. Needs GITHUB_CLIENT_SECRET or SITE_VERIFY_SECRET to sign verification tags.
// Routes: GET /api/sites/verify-token?site=URL, POST /api/sites/verify, POST /api/sites/diagnose
import { bodyOf, limited, reply } from '../_lib/http.js';
import { identify } from '../_lib/auth.js';
import { checkSite, extractPage, safeUrl, verificationTag, verificationToken } from '../_lib/web.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  const action = String(req.query?.action || '');
  try {
    const who = await identify(req);
    if (!who) return reply(req, res, 401, { error: 'Could not tell this browser apart. Reload Pothub and try again.' });
    if (limited(`site:${who.uid}`, 20)) return reply(req, res, 429, { error: 'Too many site checks. Wait a minute and try again.' });
    if (action === 'verify-token' && req.method === 'GET') {
      const site = await safeUrl(new URL(req.url || '/', 'http://x').searchParams.get('site') || '');
      if (!site) return reply(req, res, 400, { error: 'Enter a public http or https website address.' });
      const token = verificationToken(who.uid, site.hostname);
      if (!token) return reply(req, res, 503, { error: 'Site verification needs GITHUB_CLIENT_SECRET or SITE_VERIFY_SECRET in the Vercel environment variables. Add one, then redeploy.' });
      return reply(req, res, 200, { token, host: site.hostname, tag: verificationTag(token) });
    }
    if ((action === 'verify' || action === 'diagnose') && req.method === 'POST') {
      const b = bodyOf(req); const check = await checkSite(who.uid, typeof b.url === 'string' ? b.url : '');
      if (!check.ok) return reply(req, res, check.status, { error: check.error });
      if (action === 'verify') return reply(req, res, 200, { verified: true, host: check.host });
      return reply(req, res, 200, { pages: [extractPage(check.page.body, check.page.url)] });
    }
    return reply(req, res, 404, { error: 'not found' });
  } catch {
    return reply(req, res, 500, { error: 'Website check failed unexpectedly. Try again in a moment.' });
  }
}
