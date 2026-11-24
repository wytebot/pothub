import { useEffect, useState } from 'react';
import { request, requestSite } from '../security/api';
import { auth } from '../firebase';
import { Icon } from '../ui/Icon';
import { analyze, backlinkSnippet, safeLabel, type Page, type Site } from './siteDiagnosis';

const KEY = 'pothub.sites.v1';
const REPORT_KEY = 'pothub.site-diagnosis.session.v2';
type Report = Page & { siteLabel?: string };

function loadSites(): Site[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.flatMap((x: { id?: unknown; url?: unknown; label?: unknown; verified?: unknown; crawl?: unknown }) => {
      if (!x || typeof x.url !== 'string') return [];
      try {
        const u = new URL(x.url); if (!['http:', 'https:'].includes(u.protocol)) return [];
        return [{ id: typeof x.id === 'string' ? x.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url: u.toString(), label: typeof x.label === 'string' && x.label.trim() ? safeLabel(x.label) : u.hostname, verified: x.verified === true, crawl: x.crawl === true }];
      } catch { return []; }
    }).slice(0, 5);
  } catch { return []; }
}
function loadReports(): Record<string, Report> { try { const v = JSON.parse(sessionStorage.getItem(REPORT_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Configured websites: add a site, verify ownership, allow crawling, then diagnose it, all from one card. */
export function SiteTools() {
  const [sites, setSites] = useState<Site[]>(loadSites);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [tags, setTags] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, Report>>(loadReports);
  const [copied, setCopied] = useState('');
  const [premium, setPremium] = useState(false);
  const limit = premium ? 5 : 1;
  const addUrlValid = (() => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } })();

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(sites)); } catch { /* best effort */ } }, [sites]);
  useEffect(() => { try { sessionStorage.setItem(REPORT_KEY, JSON.stringify(reports)); } catch { /* best effort */ } }, [reports]);
  useEffect(() => {
    let alive = true;
    auth.currentUser?.getIdTokenResult().then(r => {
      if (!alive) return;
      const c = r.claims as Record<string, unknown>;
      const legacy = c.premium === true || c.pothubPro === true || c.pothubPlan === 'pro' || c.plan === 'pro';
      const raw = Number(c.pothubProUntil ?? 0); const until = raw > 1e11 ? raw / 1000 : raw;
      setPremium(legacy && (!until || until > Date.now() / 1000));
    }).catch(() => { if (alive) setPremium(false); });
    return () => { alive = false; };
  }, []);

  const open = sites.find(s => s.id === openId);
  const [tagBusy, setTagBusy] = useState<Record<string, boolean>>({});
  /** Asks the server for this site's tag. Always ends: the tag appears, or the reason is shown with a Try again button. */
  const loadTag = (site: Site) => {
    setTagBusy(b => ({ ...b, [site.id]: true })); setNotes(n => ({ ...n, [site.id]: '' }));
    requestSite<{ tag: string }>(`/api/sites/verify-token?site=${encodeURIComponent(site.url)}`, undefined, 15_000)
      .then(d => { if (typeof d.tag !== 'string' || !d.tag) throw new Error('The server did not send a tag. Try again.'); setTags(t => ({ ...t, [site.id]: d.tag })); })
      .catch(e => setNotes(n => ({ ...n, [site.id]: message(e, 'Could not create a verification tag.') })))
      .finally(() => setTagBusy(b => ({ ...b, [site.id]: false })));
  };
  useEffect(() => {
    if (!open || open.verified || tags[open.id] || tagBusy[open.id]) return;
    loadTag(open);
  }, [open?.id, open?.verified]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id: string, change: Partial<Site>) => setSites(list => list.map(x => x.id === id ? { ...x, ...change } : x));
  const note = (id: string, text: string) => setNotes(n => ({ ...n, [id]: text }));
  const busyWith = (id: string, what: string) => setWorking(w => ({ ...w, [id]: what }));

  function addSite() {
    if (sites.length >= limit) return;
    let clean: string;
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a valid HTTP or HTTPS website address.'); clean = parsed.toString(); }
    catch (e) { setError(message(e, 'Enter a valid website address.')); return; }
    const next: Site = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url: clean, label: safeLabel(label || new URL(clean).hostname) };
    setSites(s => [...s, next]); setOpenId(next.id); setUrl(''); setLabel(''); setError('');
  }
  function removeSite(site: Site) {
    setSites(s => s.filter(x => x.id !== site.id)); setReports(r => { const n = { ...r }; delete n[site.id]; return n; });
    if (openId === site.id) setOpenId('');
    if (site.crawl) void request('/api/publishers/remove', { host: hostOf(site.url) }).catch(() => undefined);
  }
  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1800); } catch { setError('Clipboard access failed. Select and copy the code manually.'); }
  }
  async function verify(site: Site) {
    busyWith(site.id, 'verify'); note(site.id, '');
    try { await requestSite('/api/sites/verify', { url: site.url }, 20_000); patch(site.id, { verified: true }); note(site.id, 'Site verified. You can allow crawling and run a diagnosis now.'); }
    catch (e) { note(site.id, message(e, 'Verification failed.')); }
    finally { busyWith(site.id, ''); }
  }
  async function toggleCrawl(site: Site, on: boolean) {
    patch(site.id, { crawl: on }); busyWith(site.id, 'crawl');
    if (!on) setReports(r => { const n = { ...r }; delete n[site.id]; return n; });
    try {
      if (on) {
        const r = await request<{ pageCount?: number; pages?: unknown[] }>('/api/publishers/crawl', { siteUrl: site.url, publish: true }, 30_000);
        const n = r.pageCount ?? r.pages?.length ?? 0;
        note(site.id, `Pothub can crawl this site. ${n ? `${n} page${n === 1 ? '' : 's'} shared as short excerpts for citations, kept for 30 days.` : 'Short excerpts are shared for citations and kept for 30 days.'}`);
      } else {
        await request('/api/publishers/remove', { host: hostOf(site.url) });
        note(site.id, 'Crawling turned off. Shared excerpts were removed.');
      }
    } catch (e) {
      note(site.id, on ? `Crawling is allowed for diagnosis. Sharing excerpts for citations is not available right now: ${message(e, 'try again later.')}` : `Crawling turned off. Shared excerpts could not be removed right now: ${message(e, 'try again later.')}`);
    } finally { busyWith(site.id, ''); }
  }
  async function diagnose(site: Site) {
    busyWith(site.id, 'diagnose'); note(site.id, '');
    try {
      const data = await requestSite<{ pages: Page[] }>('/api/sites/diagnose', { url: site.url }, 28_000);
      const page = data.pages?.[0];
      if (!page || typeof page.url !== 'string' || typeof page.text !== 'string') throw new Error('No readable page content was returned.');
      setReports(r => ({ ...r, [site.id]: { ...page, siteLabel: site.label } }));
    } catch (e) {
      const m = message(e, 'Diagnosis failed.');
      if (/tag not found/i.test(m)) patch(site.id, { verified: false });
      note(site.id, m);
    } finally { busyWith(site.id, ''); }
  }

  const card = (site: Site) => {
    const isOpen = openId === site.id; const tag = tags[site.id]; const report = reports[site.id]; const busy = working[site.id];
    const checks = report ? analyze(report) : []; const passed = checks.filter(c => c.ok).length;
    return <article className="notice stack site-card" key={site.id}>
      <div className="row between wrap">
        <strong>{site.label} <span className={`chip ${site.verified ? 'success' : 'warn'}`}>{site.verified ? 'Verified' : 'Not verified'}</span></strong>
        <div className="row">
          <button className="icon-btn" aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${site.label}`} aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? '' : site.id)}><Icon name="dots" size={20} /></button>
          <button className="btn" onClick={() => removeSite(site)}>Remove</button>
        </div>
      </div>
      <a href={site.url} target="_blank" rel="noopener noreferrer">{site.url}</a>
      <label className="row site-consent">
        <input type="checkbox" checked={!!site.crawl} disabled={!site.verified || busy === 'crawl'} onChange={e => void toggleCrawl(site, e.target.checked)} />
        <span><strong>Allow Pothub to crawl this site</strong><small className="muted"> {site.verified ? 'Lets Pothub read your public pages for diagnosis and to find relevant information for research answers and citations. You can turn this off any time.' : 'Verify ownership in More details first.'}</small></span>
      </label>
      {notes[site.id] && <p className="small muted" role="status">{notes[site.id]}</p>}
      {isOpen && <div className="stack site-more">
        <section className="stack"><h3>Ownership</h3>
          {site.verified ? <p className="small muted">Ownership verified. Keep the meta tag in your site's &lt;head&gt; so Pothub can re-check it.</p> : <>
            <p className="small muted">Paste this tag inside the &lt;head&gt; of your home page, publish the change, then tap Verify. Pothub only reads your public page to find the tag.</p>
            <pre className="md-code"><code>{tag || ((tagBusy[site.id] || !notes[site.id]) ? 'Preparing your tag…' : notes[site.id])}</code></pre>
            <div className="row wrap">{!tag && !tagBusy[site.id] && !!notes[site.id] && <button className="btn primary" onClick={() => loadTag(site)}>Try again</button>}<button className="btn" disabled={!tag} onClick={() => void copy(tag, `tag-${site.id}`)}>{copied === `tag-${site.id}` ? 'Copied!' : 'Copy tag'}</button><button className="btn primary" disabled={!tag || busy === 'verify'} onClick={() => void verify(site)}>{busy === 'verify' ? 'Checking…' : 'Verify site'}</button></div></>}
        </section>
        <section className="stack"><h3>Diagnosis</h3>
          <p className="small muted">Quick crawl-based checks of your home page. These are heuristics, not a ranking prediction.</p>
          <div className="row wrap"><button className="btn primary" disabled={!site.verified || !site.crawl || !!busy} onClick={() => void diagnose(site)}>{busy === 'diagnose' ? 'Crawling…' : report ? 'Run again' : 'Run diagnosis'}</button></div>
          {(!site.verified || !site.crawl) && <p className="small muted">{!site.verified ? 'Verify the site first.' : 'Allow Pothub to crawl this site to run a diagnosis.'}</p>}
          {report && <div className="stack">
            <p className="small"><strong>{passed} of {checks.length} signals passed</strong> · {report.text.length.toLocaleString()} characters read</p>
            <div className="diagnosis-bar"><span style={{ width: `${checks.length ? Math.round(passed / checks.length * 100) : 0}%`, background: '#22c55e' }} /></div>
            {checks.map(c => <details key={c.name}><summary>{c.name} <span className={`chip ${c.ok ? 'success' : 'warn'}`}>{c.ok ? 'Pass' : 'Review'}</span></summary><p className="small">{c.detail}</p>{!c.ok && <p className="small muted">{c.recommendation}</p>}</details>)}
            <details><summary>Content preview</summary><div className="crawl-preview">{report.text.slice(0, 2500)}{report.text.length > 2500 ? '…' : ''}</div></details>
          </div>}
        </section>
        <section className="stack"><h3>Backlink snippet</h3>
          <p className="small muted">An optional followed link to Pothub for a page you control. It is not a ranking guarantee.</p>
          <pre className="md-code"><code>{backlinkSnippet(site)}</code></pre>
          <div className="row wrap"><button className="btn" onClick={() => void copy(backlinkSnippet(site), `link-${site.id}`)}>{copied === `link-${site.id}` ? 'Copied!' : 'Copy snippet'}</button></div>
        </section>
      </div>}
    </article>;
  };

  return <section className="page site-tool-page">
    <header className="page-head"><div><h1>Configured websites</h1><p className="muted small">Add sites you own, verify them with a meta tag, allow Pothub to crawl them, and run diagnosis. Tap the dots on a site for details. Sites are saved on this device only.</p></div></header>
    <div className="panel stack">
      <div className="row between wrap"><h2>Your websites ({sites.length}/{limit})</h2></div>
      <p className="muted small">{premium ? 'Pro: configure up to 5 websites.' : 'Free: configure 1 website. Pro unlocks up to 5 sites.'}</p>
      {!premium && <div className="notice site-upgrade"><p className="small muted"><strong>Need more websites?</strong> Pro manages several sites in one workspace. <a href="#/billing">View Premium</a></p></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {sites.map(card)}
      {sites.length < limit && <div className="stack site-add"><h3>Add website</h3>
        <label>Website address<input className="field" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" type="url" /></label>
        <label>Site name<input className="field" value={label} onChange={e => setLabel(e.target.value)} placeholder="My website" maxLength={80} /></label>
        <button className="btn primary" disabled={!addUrlValid} onClick={addSite}>Add website</button></div>}
    </div>
  </section>;
}
