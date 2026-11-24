// Live web search API used by src/agent/search.ts.
import { verifyIdToken } from './_lib/auth.js';
import { limited, reply } from './_lib/http.js';
import { ddgSearch, parseFresh } from '../server/src/search.ts';

export const config = { maxDuration: 20 };
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  if (req.method !== 'GET') return reply(req, res, 405, { error: 'Use GET for web search.' });
  try {
    const who = await verifyIdToken(req.headers.authorization);
    if (!who) return reply(req, res, 401, { error: 'Sign in again to use live web search.' });
    if (limited(`web-search:${who.uid}`, 40)) return reply(req, res, 429, { error: 'Too many searches. Wait a minute and try again.' });
    const q = String(req.query?.q || new URL(req.url || '/', 'http://x').searchParams.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (q.length < 2) return reply(req, res, 400, { error: 'Type at least two characters to search.' });
    const results = await ddgSearch(q, 10, parseFresh(req.query?.fresh));
    return reply(req, res, 200, { results, provider: 'live-web', searchedAt: new Date().toISOString() });
  } catch (e) {
    return reply(req, res, 502, { error: e instanceof Error ? e.message : 'Live web search is temporarily unavailable.' });
  }
}
