import { useEffect, useState } from 'react';
import { request } from '../security/api';
import { isPremium } from '../quota/daily';

type Page = { url: string; title: string; text: string };
type Site = { id: string; url: string; label: string };
const KEY = 'pothub.sites.v1';
const loadSites = (): Site[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.url === 'string').slice(0, 5) : []; } catch { return []; } };
export function SiteTools() {
  const [sites, setSites] = useState<Site[]>(loadSites);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('Pothub');
  const [activeId, setActiveId] = useState(sites[0]?.id ?? '');
  const [result, setResult] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const premium = isPremium();
  const limit = premium ? 5 : 1;
  const active = sites.find(s => s.id === activeId) ?? sites[0];
  const chosenUrl = active?.url ?? url;
  const chosenLabel = active?.label ?? label;
  const valid = (() => { try { const u = new URL(chosenUrl); return ['http:', 'https:'].includes(u.protocol); } catch { return false; } })();
  const snippet = `<a href="https://pothub-self.vercel.app/"${premium ? '' : ' rel="nofollow"'}>${chosenLabel || 'Pothub'}</a>`;
  useEffect(() => { if (!premium && sites.length > 1) setSites(s => s.slice(0, 1)); }, [premium]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(sites)); } catch { /* device storage unavailable */ } }, [sites]);
  function saveSite() {
    if (!valid || sites.length >= limit) return;
    const clean = new URL(url).toString();
    const next: Site = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url: clean, label: label.trim() || 'Pothub' };
    setSites(s => [...s, next]); setActiveId(next.id); setUrl(''); setResult(null); setError('');
  }
  function removeSite(id: string) { setSites(s => s.filter(x => x.id !== id)); if (activeId === id) { setActiveId(sites.find(x => x.id !== id)?.id ?? ''); setResult(null); } }
  async function diagnose() {
    if (!valid) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const data = await request<{ pages: Page[] }>('/api/crawl', { urls: [chosenUrl] }, 25_000);
      const page = data.pages?.[0];
      if (!page) throw new Error('The page could not be crawled. Check that it is publicly accessible and serves HTML.');
      setResult(page);
    } catch (e) { setError(e instanceof Error ? e.message : 'Diagnosis failed.'); }
    finally { setBusy(false); }
  }
  const text = result?.text ?? '';
  const checks = result ? [
    { name: 'Readable page content', ok: text.length > 500, detail: text.length > 500 ? `Extracted ${text.length.toLocaleString()} characters.` : 'Very little readable text was found.' },
    { name: 'Title tag', ok: !!result.title && result.title.length > 8, detail: result.title ? `Title: ${result.title}` : 'No page title found.' },
    { name: 'Content depth', ok: text.length > 1800, detail: text.length > 1800 ? 'Page has a substantial text body.' : 'Consider adding useful, unique details and sections.' },
    { name: 'HTTPS', ok: result.url.startsWith('https://'), detail: result.url.startsWith('https://') ? 'The crawled URL uses HTTPS.' : 'Consider moving to HTTPS.' },
    { name: 'Keyword/topic signals', ok: text.split(' ').length > 120, detail: 'Ensure headings and copy clearly explain the page topic and intended audience.' },
  ] : [];
  return <section className="page">
    <h1>Website tools</h1>
    <div className="panel stack">
      <h2>Your websites ({sites.length}/{limit})</h2>
      <p className="muted small">Free accounts can configure 1 website. Premium can configure up to 5 websites. Saved sites stay on this device.</p>
      {sites.map(site => <div className="notice stack" key={site.id}>
        <div className="row"><button className={`btn${activeId === site.id ? ' primary' : ''}`} onClick={() => { setActiveId(site.id); setResult(null); setError(''); }}>{site.label}</button><button className="btn" onClick={() => removeSite(site.id)}>Remove</button></div>
        <a href={site.url} target="_blank" rel="noopener noreferrer">{site.url}</a>
      </div>)}
      {sites.length < limit && <div className="stack">
        <label>Website URL<input className="field" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" type="url" /></label>
        <label>Link label<input className="field" value={label} onChange={e => setLabel(e.target.value)} placeholder="Pothub" /></label>
        <button className="btn primary" disabled={!valid || sites.length >= limit} onClick={saveSite}>Add website</button>
      </div>}
      {!premium && sites.length >= limit && <p className="muted small">Upgrade to Premium to configure up to 5 websites.</p>}
    </div>
    <div className="panel stack">
      <h2>Website backlink</h2>
      <p className="muted small">Copy and place this link on a page you control. Pothub cannot insert links into third-party websites automatically.</p>
      <label>Link label<input className="field" value={active ? active.label : label} onChange={e => { setLabel(e.target.value); if (active) setSites(s => s.map(x => x.id === active.id ? { ...x, label: e.target.value } : x)); }} placeholder="Pothub" /></label>
      <div className="notice">Backlink type: <b>{premium ? 'Follow (dofollow)' : 'No-follow'}</b> · {premium ? 'Premium links omit nofollow.' : 'Free links include rel="nofollow".'}</div>
      <pre className="md-code"><code>{snippet}</code></pre>
      <button className="btn" onClick={() => void navigator.clipboard.writeText(snippet)}>Copy backlink HTML</button>
    </div>
    <div className="panel stack">
      <h2>Website diagnosis</h2>
      <p className="muted small">Crawl your selected public page and run basic SEO/content checks. The crawl is free. This is a technical heuristic report, not a ranking guarantee.</p>
      <button className="btn primary" disabled={!valid || busy} onClick={() => void diagnose()}>{busy ? 'Crawling site…' : 'Diagnose website'}</button>
      {error && <p className="error">{error}</p>}
      {result && <div className="stack"><h3>{result.title || result.url}</h3><a href={result.url} target="_blank" rel="noopener noreferrer">{result.url}</a>
        {checks.map(c => <div className="notice" key={c.name}><b>{c.ok ? '✓' : '△'} {c.name}</b><div className="muted small">{c.detail}</div></div>)}
        <h3>Extracted content preview</h3><p className="muted small">{text.slice(0, 2200)}{text.length > 2200 ? '…' : ''}</p>
        <p className="muted small">For a deeper AI audit, submit this URL in chat and ask Pothub to analyze SEO, content, accessibility, performance and conversion opportunities using web research.</p>
      </div>}
    </div>
  </section>;
}
