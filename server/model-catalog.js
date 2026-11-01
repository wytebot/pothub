/**
 * Active-model catalog.
 *
 * Uses a web search API (Brave Search or Tavily) to find each provider's OFFICIAL
 * deprecation / shutdown pages, extracts the model IDs listed there as deprecated or
 * retired, and lets the app hide them from model pickers so users only see models
 * that are still active.
 *
 * Safety properties:
 *  - Only model IDs and provider names are sent to the search API. User API keys never leave
 *    the existing provider calls.
 *  - Only pages on an official documentation host (OFFICIAL_DOC_HOSTS) are fetched, through
 *    fetchPinnedHttps (public-IP pinning, manual redirects, host allowlist).
 *  - Fail open: search outage, missing key, parser doubt or "would hide everything" all
 *    result in the normal list being shown. Users are never left with an empty picker, and
 *    the manual model-ID escape hatch in the picker is untouched.
 *  - Results are cached (memory + Firestore) so search cost is roughly one query per
 *    provider per TTL, shared across instances.
 *
 * Environment:
 *  MODEL_SEARCH_API_KEY        search API key (feature is passive without it)
 *  MODEL_SEARCH_PROVIDER       "brave" (default) | "tavily"
 *  MODEL_CATALOG_ENABLED       "false" turns filtering off
 *  MODEL_CATALOG_TTL_HOURS     refresh interval, default 24 (1..168)
 *  MODEL_CATALOG_HIDE          extra hidden models: "model" or "provider:model", comma separated
 *  MODEL_CATALOG_KEEP          models that must never be hidden (same format; wins over everything)
 */
import { fetchPinnedHttps } from './url-safety.js';

/** Hosts whose pages may be read as deprecation evidence. Everything else is ignored. */
export const OFFICIAL_DOC_HOSTS = {
  openai: ['platform.openai.com', 'developers.openai.com'],
  anthropic: ['docs.anthropic.com', 'docs.claude.com', 'platform.claude.com'],
  gemini: ['ai.google.dev', 'cloud.google.com'],
  mistral: ['docs.mistral.ai'],
  groq: ['console.groq.com'],
  deepseek: ['api-docs.deepseek.com'],
  xai: ['docs.x.ai'],
  cohere: ['docs.cohere.com'],
  perplexity: ['docs.perplexity.ai'],
  together: ['docs.together.ai'],
  fireworks: ['docs.fireworks.ai'],
  openrouter: ['openrouter.ai'],
  runway: ['docs.dev.runwayml.com'],
  luma: ['docs.lumalabs.ai'],
};

const SEARCH_HOSTS = { brave: 'api.search.brave.com', tavily: 'api.tavily.com' };
const DAY = 86_400_000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_PAGES = 3;
const MAX_ENTRIES = 600;
const FAILURE_BACKOFF_MS = 15 * 60_000;
const SCHEDULED_HORIZON_DAYS = 90;
const REFRESHES_PER_HOUR = 30;

const RETIRED_RE = /\b(retired|shut ?down|shutdown|shut ?off|discontinued|end[- ]of[- ]life|eol|no longer (?:available|supported)|sunset(?:ted)?|decommission\w*)\b/i;
const DEPRECATED_RE = /\b(deprecat\w*|legacy|scheduled for (?:removal|retirement)|will be (?:retired|removed|shut ?down))\b/i;
const EXPLICIT_RE = new RegExp(`${RETIRED_RE.source}|${DEPRECATED_RE.source}`, 'i');
const TABLE_CONTEXT_RE = /(deprecat|shut ?down|retire|sunset|end[- ]of[- ]life|discontinu|decommission)/i;
const HEADER_WORD_RE = /(deprecat|shut ?down|retire|sunset|end[- ]of[- ]life|discontinu|decommission|replac|recommend|alternativ|status|model|date)/i;
const REPLACEMENT_HEADER_RE = /(replac|recommend|alternativ|migrat|successor)/i;
const REPLACEMENT_LEAD_RE = /(?:replace[ds]?\s+(?:by|with)|replacement|recommended?|migrate\s+to|switch\s+to|upgrade\s+to|use|try|successor|alternative)\s*[:(]?\s*$/i;
const ACTIVE_RE = /\b(active|generally available|currently available)\b/i;
const TOKEN_RE = /[A-Za-z][A-Za-z0-9]*(?:[-_.:/][A-Za-z0-9]+)+/g;
const SUFFIX_RE = /(latest|preview|exp|experimental|chat|reasoner|instruct|plus|turbo|mini|nano|large|small|flash|pro)$/i;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = (s) => { const w = String(s).toLowerCase(); return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)) || (w === 'sept' && m === 'september')); };

/* ---------------------------------------------------------------- text helpers */

export function htmlToLines(input) {
  let s = String(input || '');
  s = s.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<\/(td|th)>/gi, ' | ').replace(/<\/(tr|p|li|h[1-6]|div|section|ul|ol|table|pre|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  return s.split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').replace(/(\|\s*)+$/, '').trim()).filter(Boolean);
}

export function parseDates(text) {
  const out = [];
  let s = String(text || '');
  // Each pass blanks what it matched so a full date is not re-read as a month-only date.
  const pass = (re, read) => { s = s.replace(re, (...m) => { const v = read(m); if (v !== null && Number.isFinite(v)) out.push(v); return ' '.repeat(m[0].length); }); };
  pass(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (m) => Date.UTC(+m[1], +m[2] - 1, +m[3]));
  pass(/\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g, (m) => { const i = monthIndex(m[1]); return i >= 0 ? Date.UTC(+m[3], i, +m[2]) : null; });
  pass(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]{2,8})\.?,?\s+(20\d{2})\b/g, (m) => { const i = monthIndex(m[2]); return i >= 0 ? Date.UTC(+m[3], i, +m[1]) : null; });
  pass(/\b([A-Z][a-z]{2,8})\.?\s+(20\d{2})\b/g, (m) => { const i = monthIndex(m[1]); return i >= 0 ? Date.UTC(+m[2], i + 1, 0) : null; }); // end of month
  return out;
}

const isoDay = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null);

function modelTokens(text, offset = 0) {
  const out = [];
  for (const m of String(text).matchAll(TOKEN_RE)) {
    const t = m[0];
    if (t.length < 4 || t.length > 120) continue;
    if (!(/\d/.test(t) || SUFFIX_RE.test(t))) continue;
    out.push({ id: t.replace(/[.:/-]+$/, ''), index: offset + m.index });
  }
  return out;
}

/**
 * Pulls deprecated / retired model IDs out of documentation text (HTML, Markdown or plain).
 * Precision is favoured over recall: a model that is merely mentioned as a replacement,
 * or whose row is marked active, is never flagged.
 * @returns {Map<string,{id:string,status:'deprecated'|'retired',date:string|null}>} keyed by lower-case ID
 */
export function extractDeprecations(text, { now = Date.now() } = {}) {
  const found = new Map();
  let ctx = null; // table context from the latest header row: {deprecation:boolean, replCols:Set<number>}
  const put = (id, status, date) => {
    const key = id.toLowerCase();
    const old = found.get(key);
    if (old && (old.status === 'retired' || old.status === status)) return;
    found.set(key, { id, status, date });
  };
  const classify = (segment, tableCtx) => {
    const explicit = EXPLICIT_RE.test(segment);
    if (explicit && ACTIVE_RE.test(segment)) return null; // ambiguous: keep the model visible
    const dates = parseDates(segment);
    const latest = dates.length ? Math.max(...dates) : null;
    if (explicit) {
      if (RETIRED_RE.test(segment) && (latest === null || latest <= now)) return { status: 'retired', date: isoDay(latest) };
      return { status: latest !== null && latest <= now ? 'retired' : 'deprecated', date: isoDay(latest) };
    }
    if (tableCtx?.deprecation && latest !== null) {
      if (latest <= now) return { status: 'retired', date: isoDay(latest) };
      if (latest <= now + SCHEDULED_HORIZON_DAYS * DAY) return { status: 'deprecated', date: isoDay(latest) };
    }
    return null;
  };

  for (const raw of htmlToLines(text)) {
    const line = raw.replace(/https?:\/\/\S+/g, ' ').trim();
    if (!line || /^[\s|:-]+$/.test(line)) continue;

    if (line.includes('|')) {
      const cells = line.split('|').map((c) => c.trim());
      const cellTokens = cells.map((c) => modelTokens(c));
      const hasModel = cellTokens.some((t) => t.length);
      if (!hasModel && cells.length >= 2 && HEADER_WORD_RE.test(line)) {
        ctx = { deprecation: TABLE_CONTEXT_RE.test(line), replCols: new Set(cells.map((c, i) => (REPLACEMENT_HEADER_RE.test(c) ? i : -1)).filter((i) => i >= 0)) };
        continue;
      }
      if (!hasModel) continue;
      const verdict = classify(cells.filter((_, i) => !ctx?.replCols.has(i)).join(' | '), ctx);
      if (!verdict) continue;
      const usable = cellTokens.map((t, i) => (ctx?.replCols.has(i) ? [] : t));
      const picked = ctx?.replCols.size ? usable.flat() : (usable.find((t) => t.length) || []).slice(0, 2);
      for (const t of picked) put(t.id, verdict.status, verdict.date);
      continue;
    }

    ctx = null;
    const tokens = modelTokens(line);
    if (!tokens.length) continue;
    const verdict = classify(line, null);
    if (!verdict) continue;
    // Prose: take the model nearest to each status keyword, skipping replacement mentions.
    for (const k of line.matchAll(new RegExp(EXPLICIT_RE.source, 'gi'))) {
      let best = null;
      for (const t of tokens) {
        const distance = Math.abs(t.index - k.index);
        if (distance > 90 || REPLACEMENT_LEAD_RE.test(line.slice(Math.max(0, t.index - 28), t.index))) continue;
        if (!best || distance < best.distance) best = { ...t, distance };
      }
      if (best) put(best.id, verdict.status, verdict.date);
    }
  }
  return found;
}

/* ---------------------------------------------------------------- IO helpers */

const hostAllowed = (url, hosts) => { try { const h = new URL(url).hostname.toLowerCase(); return hosts.some((x) => h === x || h.endsWith(`.${x}`)); } catch { return false; } };

async function readCapped(response, limit = MAX_PAGE_BYTES) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { chunks.push(value.slice(0, value.length - (size - limit))); await reader.cancel().catch(() => {}); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function defaultFetchPage(url, hosts, signal) {
  let target = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const r = await fetchPinnedHttps(target, { allowHosts: hosts, signal, headers: { Accept: 'text/html,text/markdown,text/plain;q=0.9', 'User-Agent': 'PotHub-ModelCatalog/1.0' } });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = r.headers.get('location');
      if (!next) throw new Error('Redirect without location.');
      target = new URL(next, target).toString();
      if (!hostAllowed(target, hosts)) throw new Error('Redirect left the official documentation hosts.');
      continue;
    }
    if (!r.ok) throw new Error(`Documentation page returned ${r.status}.`);
    return readCapped(r);
  }
  throw new Error('Too many redirects.');
}

async function defaultSearch({ query, provider, key, hosts, signal }) {
  if (provider === 'tavily') {
    const r = await fetchPinnedHttps('https://api.tavily.com/search', {
      method: 'POST', allowHosts: [SEARCH_HOSTS.tavily], signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: 10, search_depth: 'basic', include_domains: hosts, include_raw_content: true }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Search API returned ${r.status}.`);
    return (data.results || []).map((x) => ({ url: x.url, title: x.title, snippet: x.content, text: x.raw_content }));
  }
  const url = `https://${SEARCH_HOSTS.brave}/res/v1/web/search?${new URLSearchParams({ q: query, count: '15', safesearch: 'strict' })}`;
  const r = await fetchPinnedHttps(url, { allowHosts: [SEARCH_HOSTS.brave], signal, headers: { Accept: 'application/json', 'X-Subscription-Token': key } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Search API returned ${r.status}.`);
  return (data.web?.results || []).map((x) => ({ url: x.url, title: x.title, snippet: x.description }));
}

async function defaultStore() {
  try {
    const { firestore } = await import('./lib.js');
    if (!firestore) return null;
    const col = firestore.collection('model_catalog');
    return {
      async get(id) { const s = await col.doc(id).get(); return s.exists ? s.data() : null; },
      async set(id, value) { await col.doc(id).set(value); },
    };
  } catch { return null; }
}

/* ---------------------------------------------------------------- catalog */

const csv = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const listed = (list, provider, model) => list.includes(model.toLowerCase()) || list.includes(`${provider}:${model}`.toLowerCase());

export function createModelCatalog(deps = {}) {
  const env = () => deps.env || process.env;
  const now = () => (deps.now ? deps.now() : Date.now());
  const memory = new Map();
  const inflight = new Map();
  const refreshLog = [];
  let store; // resolved lazily

  const config = () => {
    const e = env();
    const ttl = Math.min(168, Math.max(1, Number(e.MODEL_CATALOG_TTL_HOURS) || 24)) * 3_600_000;
    const searchProvider = String(e.MODEL_SEARCH_PROVIDER || 'brave').toLowerCase() === 'tavily' ? 'tavily' : 'brave';
    return { enabled: String(e.MODEL_CATALOG_ENABLED || 'true').toLowerCase() !== 'false', ttl, key: String(e.MODEL_SEARCH_API_KEY || ''), searchProvider, hide: csv(e.MODEL_CATALOG_HIDE), keep: csv(e.MODEL_CATALOG_KEEP) };
  };

  async function getStore() { if (store === undefined) store = deps.store !== undefined ? deps.store : await defaultStore(); return store; }

  async function load(provider) {
    if (memory.has(provider)) return memory.get(provider);
    const s = await getStore();
    if (!s) return null;
    try { const rec = await s.get(provider); if (rec) memory.set(provider, rec); return rec || null; } catch { return null; }
  }
  async function save(provider, rec) {
    memory.set(provider, rec);
    const s = await getStore();
    if (!s) return;
    try { await s.set(provider, rec); } catch { /* cache only */ }
  }

  async function discover(provider, cfg) {
    const hosts = OFFICIAL_DOC_HOSTS[provider];
    if (!hosts) throw new Error('No official documentation host is registered for this provider.');
    const year = new Date(now()).getUTCFullYear();
    const query = `${provider} API model deprecations shutdown retired models ${year}`;
    const signal = AbortSignal.timeout(9000);
    const search = deps.search || defaultSearch;
    const results = (await search({ query, provider: cfg.searchProvider, key: cfg.key, hosts, signal })).filter((x) => x?.url && hostAllowed(x.url, hosts));
    if (!results.length) throw new Error('Search returned no official documentation pages.');
    const fetchPage = deps.fetchPage || defaultFetchPage;
    const found = new Map();
    const sources = [];
    for (const r of results.slice(0, MAX_PAGES)) {
      let text = r.text;
      try { if (!text) text = await fetchPage(r.url, hosts, signal); } catch { text = r.snippet || ''; }
      const part = extractDeprecations(`${text || ''}\n${r.snippet || ''}`, { now: now() });
      for (const [k, v] of part) if (!found.has(k) || v.status === 'retired') found.set(k, { ...v, source: r.url });
      sources.push(r.url);
    }
    return { deprecated: [...found.values()].slice(0, MAX_ENTRIES), sources };
  }

  async function refresh(provider) {
    const cfg = config();
    if (!cfg.key) return null;
    if (inflight.has(provider)) return inflight.get(provider);
    const cutoff = now() - 3_600_000;
    while (refreshLog.length && refreshLog[0] < cutoff) refreshLog.shift();
    if (refreshLog.length >= REFRESHES_PER_HOUR) return null;
    refreshLog.push(now());
    const job = (async () => {
      const old = await load(provider);
      try {
        const { deprecated, sources } = await discover(provider, cfg);
        const rec = { provider, checkedAt: now(), attemptedAt: now(), deprecated, sources, lastError: null };
        await save(provider, rec);
        return rec;
      } catch (e) {
        const rec = { ...(old || { provider, deprecated: [], sources: [] }), attemptedAt: now(), lastError: String(e?.message || e).slice(0, 200) };
        await save(provider, rec);
        return rec;
      } finally { inflight.delete(provider); }
    })();
    inflight.set(provider, job);
    return job;
  }

  /** Returns the freshest record available within `waitMs`; never throws. */
  async function status(provider, { waitMs = 6000, force = false } = {}) {
    try {
      const cfg = config();
      let rec = await load(provider);
      const stale = !rec?.checkedAt || now() - rec.checkedAt >= cfg.ttl;
      const cooling = rec?.attemptedAt && now() - rec.attemptedAt < FAILURE_BACKOFF_MS && rec.lastError;
      if (force || (stale && !cooling)) {
        const job = refresh(provider);
        if (job) {
          const fresh = await Promise.race([job, new Promise((r) => setTimeout(() => r(undefined), waitMs))]);
          if (fresh) rec = fresh;
        }
      }
      return rec || null;
    } catch { return null; }
  }

  /** Splits `models` into active and hidden (deprecated/retired) lists. */
  async function filterActiveModels(provider, models, opts = {}) {
    const list = [...new Set((models || []).map((m) => String(m).trim()).filter(Boolean))];
    const cfg = config();
    const base = { active: list, hidden: [], verified: false, checkedAt: null, reason: null };
    if (!cfg.enabled) return { ...base, reason: 'disabled' };
    const rec = await status(provider, opts);
    const known = new Map((rec?.deprecated || []).map((x) => [String(x.id).toLowerCase(), x]));
    const hidden = []; const active = [];
    for (const id of list) {
      const hit = known.get(id.toLowerCase());
      const forced = listed(cfg.hide, provider, id);
      if (listed(cfg.keep, provider, id)) active.push(id);
      else if (hit) { hidden.push({ id, status: hit.status, date: hit.date || null, source: hit.source || null }); }
      else if (forced) hidden.push({ id, status: 'hidden-by-admin', date: null, source: null });
      else active.push(id);
    }
    const verified = Boolean(rec?.checkedAt);
    const checkedAt = rec?.checkedAt || null;
    if (!hidden.length) return { ...base, verified, checkedAt };
    if (!active.length) return { ...base, verified, checkedAt, reason: 'would-hide-all' };
    if (list.length >= 8 && hidden.length / list.length > 0.6) return { ...base, verified, checkedAt, reason: 'suspicious-ratio' };
    return { active, hidden, verified, checkedAt, reason: null };
  }

  return { filterActiveModels, status, refresh, config };
}

export const modelCatalog = createModelCatalog();
export const filterActiveModels = (...args) => modelCatalog.filterActiveModels(...args);
