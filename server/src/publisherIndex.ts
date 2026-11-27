import { createHash } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from './adminApp';
import type { CrawledPage } from './crawl';
const db = () => getFirestore(adminApp());
const searchCache = new Map<string, { at: number; rows: ReturnType<typeof searchResultShape>[] }>();
function searchResultShape() { return { title: '', url: '', snippet: '', text: '', site: '', published: undefined as string | undefined, updated: undefined as string | undefined }; }
const id = (s: string) => createHash('sha256').update(s).digest('hex');
const cleanUrl = (s: string) => { const u = new URL(s); if (!['https:', 'http:'].includes(u.protocol)) throw new Error('Only HTTP/HTTPS sites can be published.'); u.hash = ''; return u.toString(); };
const TERMS_STOP = new Set(['the','and','for','with','from','about','what','how','when','where','why','this','that','are','was','were','into','your','you','can','could','should','will','best','latest','give','tell','find','show','please']);
const terms = (q: string) => [...new Set(q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter(x => !TERMS_STOP.has(x)).slice(0, 16);
export type PublisherPage = { url: string; title: string; summary: string; text: string; published?: string; updated?: string };
/** Firestore holds only compact text excerpts and metadata; no files, images, attachments, or full HTML. */
export async function publishCrawl(uid: string, siteUrl: string, pages: CrawledPage[]) {
  const url = cleanUrl(siteUrl); const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  const compact: PublisherPage[] = pages.slice(0, 6).map(p => ({ url: cleanUrl(p.finalUrl || p.url), title: String(p.title || host).slice(0, 160), summary: String(p.description || '').slice(0, 180), text: String(p.text || '').slice(0, 1200), published: p.published, updated: p.updated })).filter(p => p.text.length >= 120);
  if (!compact.length) throw new Error('No readable pages to publish.');
  const now = Date.now(); const ref = db().collection('publisherSites').doc(id(host)); const snap = await ref.get();
  if (snap.exists && snap.data()?.ownerUid !== uid) throw new Error('This domain is already connected to a different publisher account.');
  if (!snap.exists) { const owned = await db().collection('publisherSites').where('ownerUid', '==', uid).limit(3).get(); if (owned.size >= 3) throw new Error('Publisher index is limited to three sites per account. Remove an existing publisher before adding another.'); }
  await ref.set({ ownerUid: uid, host, siteUrl: url, pages: compact, pageCount: compact.length, publishedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 30 * 86400000), schemaVersion: 1 }, { merge: false });
  searchCache.clear(); return { host, pageCount: compact.length, storedChars: compact.reduce((n, p) => n + p.text.length + p.summary.length + p.title.length, 0), expiresAt: new Date(now + 30 * 86400000).toISOString() };
}
export async function searchPublisherIndex(query: string, max = 6) {
  const qterms = terms(query); if (qterms.length < 1) return []; const cacheKey = qterms.join(' '); const cached = searchCache.get(cacheKey); if (cached && Date.now() - cached.at < 5 * 60_000) return cached.rows.slice(0, max);
  // A bounded scan of 12 small opt-in publisher documents keeps query cost predictable.
  const docs = await db().collection('publisherSites').limit(12).get(); const now = Date.now(); const out: { title: string; url: string; snippet: string; text: string; site: string; published: string | undefined; updated: string | undefined; score: number }[] = [];
  for (const doc of docs.docs) { const d = doc.data(); if (!(d.expiresAt instanceof Timestamp) || d.expiresAt.toMillis() <= now || !Array.isArray(d.pages)) continue; const host = String(d.host || '');
    for (const raw of d.pages.slice(0, 8)) { if (!raw || typeof raw.text !== 'string' || typeof raw.url !== 'string') continue; const searchable = `${raw.title || ''} ${raw.summary || ''} ${raw.text}`.toLowerCase(); const matched = qterms.filter(t => searchable.includes(t)); const score = matched.length * 2 + matched.filter(t => String(raw.title || '').toLowerCase().includes(t)).length * 2; if (matched.length < Math.min(2, qterms.length) || score < 3) continue;
      out.push({ title: String(raw.title || host).slice(0, 160), url: raw.url, snippet: String(raw.summary || raw.text).slice(0, 220), text: raw.text.slice(0, 1200), site: host, published: typeof raw.published === 'string' ? raw.published : undefined, updated: typeof raw.updated === 'string' ? raw.updated : undefined, score });
    }
  }
  const rows = out.sort((a,b) => b.score-a.score).slice(0, max).map(({ score, ...h }) => h); searchCache.set(cacheKey, { at: now, rows }); if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value!); return rows;
}
export async function removePublisher(uid: string, hostInput: string) { const host = hostInput.replace(/^www\./, '').toLowerCase(); const ref = db().collection('publisherSites').doc(id(host)); const snap = await ref.get(); if (!snap.exists || snap.data()?.ownerUid !== uid) return false; await ref.delete(); searchCache.clear(); return true; }
