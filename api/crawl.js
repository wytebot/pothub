// Safe live-page crawler used by the research agent and configured-site integration.
import { verifyIdToken } from './_lib/auth.js';
import { bodyOf, limited, reply } from './_lib/http.js';
import { crawlSites } from '../server/src/crawl.ts';

export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  if (req.method !== 'POST') return reply(req, res, 405, { error: 'Use POST to crawl pages.' });
  try {
    const who = await verifyIdToken(req.headers.authorization);
    if (!who) return reply(req, res, 401, { error: 'Sign in again to read live websites.' });
    if (limited(`web-crawl:${who.uid}`, 15)) return reply(req, res, 429, { error: 'Too many crawl requests. Wait a minute and try again.' });
    const b = bodyOf(req);
    const urls = Array.isArray(b.urls) ? [...new Set(b.urls.filter(x => typeof x === 'string').slice(0, 12))] : [];
    if (!urls.length) return reply(req, res, 400, { error: 'Provide at least one public website URL.' });
    const query = typeof b.query === 'string' ? b.query.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
    const result = await crawlSites(urls, { query, depth: b.depth === 1 ? 1 : 2, maxPages: 20, budgetMs: 24_000 });
    return reply(req, res, 200, result);
  } catch (e) {
    return reply(req, res, 502, { error: e instanceof Error ? e.message : 'Live website crawling failed. Try again.' });
  }
}
