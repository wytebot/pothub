import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { request } from '../security/api';
import { auth } from '../firebase';

import { analyze, backlinkSnippet, safeLabel, type Page, type Site } from './siteDiagnosis';
const KEY = 'pothub.sites.v1';
const RESULT_KEY = 'pothub.site-diagnosis.session.v1';
type DiagnosisResult = Page & { siteLabel?: string };
const loadSites = (): Site[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(v)) return []; return v.flatMap((x: {id?:unknown;url?:unknown;label?:unknown}) => { if (!x || typeof x.url !== 'string') return []; try { const u = new URL(x.url); if (!['http:', 'https:'].includes(u.protocol)) return []; return [{ id: typeof x.id === 'string' ? x.id : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, url: u.toString(), label: typeof x.label === 'string' && x.label.trim() ? safeLabel(x.label) : u.hostname }]; } catch { return []; } }).slice(0, 5); } catch { return []; } };
function go(path: string) { location.hash = path; }
function PageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="page site-tool-page"><header className="page-head"><div><h1>{title}</h1><p className="muted small">{description}</p></div><div className="row wrap site-tools-nav"><a className="btn" href="#/sites">Sites</a><a className="btn" href="#/sites/backlinks">Backlink snippets</a><a className="btn" href="#/sites/diagnosis">Diagnosis</a></div></header>{children}</section>; }
export function SiteTools({ mode = 'sites' }: { mode?: 'sites' | 'backlinks' | 'diagnosis' | 'results' }) {
  const [sites, setSites] = useState<Site[]>(loadSites);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [result, setResult] = useState<DiagnosisResult | null>(() => { try { const s = sessionStorage.getItem(RESULT_KEY); return s ? JSON.parse(s) as Page : null; } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState(() => loadSites()[0]?.id ?? '');
  const [premium, setPremium] = useState(false);
  const freeLimit = 1;
  const limit = premium ? 5 : freeLimit;

  const addUrlValid = (() => { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol); } catch { return false; } })();
  const checks = useMemo(() => result ? analyze(result) : [], [result]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(sites)); } catch { /* best effort */ } }, [sites]);
  useEffect(() => { let alive = true; auth.currentUser?.getIdTokenResult().then(r => { if (!alive) return; const claims = r.claims as Record<string, unknown>; const legacy = claims.premium === true || claims.pothubPro === true || claims.pothubPlan === 'pro' || claims.plan === 'pro'; const raw = Number(claims.pothubProUntil ?? 0); const until = raw > 1e11 ? raw / 1000 : raw; setPremium(legacy && (!until || until > Date.now() / 1000)); }).catch(() => { if (alive) setPremium(false); }); return () => { alive = false; }; }, []);
  function saveSite() {
    if (sites.length >= limit) return;
    let clean: string; try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a valid HTTP or HTTPS website URL.'); clean = parsed.toString(); } catch (e) { setError(e instanceof Error ? e.message : 'Enter a valid website URL.'); return; }
    const next: Site = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url: clean, label: safeLabel(label || new URL(clean).hostname) };
    setSites(s => [...s, next]); setUrl(''); setLabel(''); setError('');
  }
  function removeSite(id: string) { setSites(s => s.filter(x => x.id !== id)); }
  async function copy(text: string, id: string) { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1800); } catch { setError('Clipboard access failed. Select and copy the code manually.'); } }
  if (mode === 'backlinks') return <PageShell title="Backlink snippets" description="Create a transparent, dofollow link snippet for a site you control.">
    <div className="panel stack"><h2>Your configured sites</h2><p className="muted small">Each snippet is personalized with the configured site's name. A normal followed link omits rel="nofollow", "sponsored" and "ugc". Add it only to pages you control; this is not a ranking guarantee.</p>
      {!sites.length && <div className="notice">Configure a site first. <a href="#/sites">Go to sites</a></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {sites.map(site => { const code = backlinkSnippet(site); return <article className="panel stack backlink-card" key={site.id}><div className="row between wrap"><div><h3>{site.label}</h3><a href={site.url} target="_blank" rel="noopener noreferrer">{site.url}</a></div><span className="chip">Followed link</span></div><pre className="md-code"><code>{code}</code></pre><div className="row wrap"><button className="btn primary" onClick={() => void copy(code, site.id)}>{copied === site.id ? 'Copied!' : 'Copy snippet'}</button><a className="btn" href={site.url} target="_blank" rel="noopener noreferrer">Open site</a></div></article>; })}
    </div>
  </PageShell>;
  if (mode === 'diagnosis') { const selectedSite = sites.find(s => s.id === selectedSiteId) ?? sites[0]; return <PageShell title="Website diagnosis" description="Choose a connected site by name, run a crawl and open its separate report.">
    <div className="panel stack"><h2>Diagnose a website</h2>{!sites.length && <div className="notice">Add your first website to begin. <a href="#/sites">Configure websites</a></div>}
      {!!sites.length && <><label className="stack">Website<select className="field" value={selectedSite?.id ?? ''} onChange={e=>setSelectedSiteId(e.target.value)}>{sites.map(site=><option key={site.id} value={site.id}>{site.label}</option>)}</select></label><div className="notice stack"><div className="row between wrap"><strong>{selectedSite?.label}</strong><a href={selectedSite?.url} target="_blank" rel="noopener noreferrer">Open site ↗</a></div><div className="muted small">{selectedSite?.url}</div><button className="btn primary" disabled={busy||!selectedSite} onClick={() => { void (async()=>{if(!selectedSite)return;setBusy(true);setError('');try{const data=await request<{pages:Page[]}>('/api/crawl',{urls:[selectedSite.url]},25_000);const page=data.pages?.[0];if(!page||typeof page.url!=='string'||typeof page.text!=='string')throw new Error('No readable crawlable page content was returned.');const report:DiagnosisResult={...page,siteLabel:selectedSite.label};setResult(report);sessionStorage.setItem(RESULT_KEY,JSON.stringify(report));go('/sites/diagnosis/results');}catch(e){setError(e instanceof Error?e.message:'Diagnosis failed.');}finally{setBusy(false);}})(); }}>{busy ? 'Crawling…' : `Diagnose ${selectedSite?.label ?? 'site'}`}</button></div></>}{error&&<p className="error" role="alert">{error}</p>}</div>
    <div className="panel"><h2>What the quick diagnosis checks</h2><ul><li>HTTPS and readable text</li><li>Title quality signals</li><li>Content depth and topic clarity</li><li>Heading structure signals</li><li>Link opportunities</li><li>Canonical hints</li></ul><p className="muted small">These are crawl-based heuristics, not a Google ranking prediction. HTML tags such as canonical, heading structure and metadata may not be fully exposed by text extraction.</p></div>
  </PageShell>; }
  if (mode === 'results') return <PageShell title="Diagnosis results" description="Your latest crawl report and suggested improvements.">
    {!result ? <div className="panel stack"><h2>No report in this session</h2><p>Run a diagnosis first. Reports are held in session memory and are not sent to Pothub storage.</p><a className="btn primary" href="#/sites/diagnosis">Start diagnosis</a></div> : <>
      <div className="panel stack"><div className="row between wrap"><div><h2>{result.title || 'Untitled page'}</h2>{result.siteLabel && <p className="muted small">Site: {result.siteLabel}</p>}<a href={result.url} target="_blank" rel="noopener noreferrer">{result.url}</a></div><span className="chip">Quick crawl</span></div><p className="muted small">{checks.filter(c=>c.ok).length} of {checks.length} signals passed · {result.text.length.toLocaleString()} extracted characters</p><div className="diagnosis-summary">{checks.map(c=><article className="notice diagnosis-check" key={c.name}><div className="row between"><strong>{c.name}</strong><span className={`chip ${c.ok?'success':'warn'}`}>{c.ok?'Looks good':'Review'}</span></div><p className="small muted">{c.detail}</p><p className="small">{c.recommendation}</p></article>)}</div></div>
      <div className="panel stack"><h2>Content preview</h2><p className="muted small">Crawl output preview · {result.text.length.toLocaleString()} characters total</p><div className="crawl-preview">{result.text.slice(0,3500)}{result.text.length>3500?'…':''}</div></div><div className="row wrap"><a className="btn" href="#/sites/diagnosis">Run another diagnosis</a><a className="btn" href="#/sites/backlinks">Get backlink snippet</a></div>
    </>}</PageShell>;
  return <PageShell title="Configured websites" description="Manage sites you own. Configuration is saved on this device only.">
    <div className="panel stack"><div className="row between wrap"><h2>Your websites ({sites.length}/{limit})</h2><a className="btn" href="#/sites/backlinks">Backlink snippets</a></div><p className="muted small">{premium ? 'Pro: configure up to 5 websites.' : 'Free: configure 1 website. Pro unlocks up to 5 sites.'} Site URLs and labels are stored locally, not in Pothub's cloud.</p>{!premium && <div className="notice site-upgrade"><strong>Need multiple websites?</strong><p className="small muted">Pro is designed for managing several sites in one workspace. Free diagnosis and backlink snippets remain available.</p><a className="btn primary" href="#/billing">View Premium</a></div>}
      {error && <p className="error" role="alert">{error}</p>}{sites.map(site=><article className="notice stack" key={site.id}><div className="row between wrap"><strong>{site.label}</strong><div className="row wrap"><a className="btn" href="#/sites/diagnosis">Diagnose</a><button className="btn" onClick={()=>removeSite(site.id)}>Remove</button></div></div><a href={site.url} target="_blank" rel="noopener noreferrer">{site.url}</a></article>)}
      {sites.length<limit&&<div className="stack site-add"><h3>Add website</h3><label>Website URL<input className="field" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" type="url" /></label><label>Site label<input className="field" value={label} onChange={e=>setLabel(e.target.value)} placeholder="My website" maxLength={80}/></label><button className="btn primary" disabled={!addUrlValid||sites.length>=limit} onClick={saveSite}>Add website</button></div>}
    </div><div className="panel stack"><h2>Website tools</h2><div className="row wrap"><a className="btn primary" href="#/sites/diagnosis">Diagnose</a><a className="btn" href="#/sites/backlinks">Backlink snippets</a></div><p className="muted small">Diagnosis reports are session-only and disappear when you close the app or browser tab. No site content or reports are uploaded to Pothub storage.</p></div>
  </PageShell>;
}
