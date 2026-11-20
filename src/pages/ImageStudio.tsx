import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteMedia, listLibrary, putMedia, uid, type MediaRecord } from '../storage/db';
import { defaultKeys, listKeys, type KeyMeta } from '../vault/vault';
import { ratio } from '../models/registry';
import { cachedCatalog, refreshCatalog } from '../agent/detect';
import { RunLog } from '../agent/log';
import { runImage, runInfo } from '../agent/workflow';
import { Terminal } from '../ui/Terminal';
import { platform } from '../platform';
import { getSettings } from '../settings';
import { Select } from '../ui/Select';

type Item = { rec: MediaRecord; url: string };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

export function ImageStudio() {
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem('studio.prompt') ?? '');
  const [format, setFormat] = useState('auto');
  const [prefer, setPrefer] = useState<'quality' | 'speed'>(getSettings().priority);
  const [model, setModel] = useState('auto');
  const [count, setCount] = useState('1');
  const [keys, setKeys] = useState<KeyMeta[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [catalog, setCatalog] = useState(cachedCatalog);
  const log = useRef(new RunLog()).current;
  const abort = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    const recs = await listLibrary();
    urls.current.forEach(URL.revokeObjectURL);
    const next = recs.filter((r) => r.kind === 'image').map((rec) => ({ rec, url: URL.createObjectURL(rec.blob) }));
    urls.current = next.map((n) => n.url); setItems(next);
  }, []);
  useEffect(() => { sessionStorage.removeItem('studio.prompt'); setKeys(listKeys()); load().catch(() => setMsg({ text: 'Your image library could not be read.', error: true })); return () => urls.current.forEach(URL.revokeObjectURL); }, [load]);

  const connected = new Set(defaultKeys('image').map((k) => k.provider));
  // Live list of models the connected keys can really use right now (quiet refresh, never blocks the page).
  useEffect(() => { setCatalog(cachedCatalog()); if (connected.size) void refreshCatalog().then(setCatalog); }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setMsg(null); log.clear(); setBusy(true); abort.current = new AbortController(); const signal = abort.current.signal;
    try {
      if (await runInfo(prompt, log, signal)) return;
      const res = await runImage({ prompt, count: Number(count), format, prefer, model, signal, log, routed: true }); // this page only makes pictures: never re-judge the wording as "writing"
      const sv = log.start('cmd', 'library.save');
      for (const m of res.images) await putMedia({ id: uid(), projectId: null, kind: 'image', name: `${slug(res.prompt)}.png`, mime: m.mime, size: m.blob.size, createdAt: Date.now(), blob: m.blob }); // saved locally immediately
      log.done(sv, `${res.images.length} saved on this device`); log.say('ok', 'done');
      setMsg({ text: [`Created ${res.images.length} image(s) with ${res.model.name} at ${res.aspect}.`, ...res.notes].join(' ') });
      await load();
    } catch (e) {
      log.settle('failed');
      const m = e instanceof Error ? e.message : 'Generation failed. Try again.';
      if (m === 'Cancelled.') log.say('warn', 'cancelled'); else log.say('err', m);
      setMsg({ text: m === 'Cancelled.' ? 'Cancelled.' : m, error: m !== 'Cancelled.' });
    }
    finally { setBusy(false); abort.current = null; }
  };

  const chosen = catalog.image.find((m) => m.id === model);
  const maxCount = chosen ? chosen.maxBatch : 4;
  const aspectOptions = [{ value: 'auto', label: 'Auto (from prompt)' }, ...(chosen ? chosen.aspects : [...new Set(catalog.image.flatMap((m) => m.aspects))].sort((a, b) => ratio(a) - ratio(b))).map((a) => ({ value: a, label: a }))];

  return (
    <section className="page">
      <header className="page-head">
        <h1>Image Studio</h1>
        <span className="muted small">Unlimited</span>
      </header>
      {connected.size === 0 && <div className="notice">No default image key. <a href="#/providers">Add an API key</a> and tick it as default for Images.</div>}
      <div className="panel stack">
        <label className="field">Describe the image
          <textarea rows={3} value={prompt} maxLength={2000} placeholder="A realistic photo of a luxury apartment at golden hour" onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <div className="row">
          <Select label="Format" value={format} onChange={setFormat} options={aspectOptions} />
          <Select<'quality' | 'speed'> label="Priority" value={prefer} onChange={setPrefer} options={[{ value: 'quality', label: 'Best quality' }, { value: 'speed', label: 'Fastest' }]} />
          <Select label="Model" value={model} onChange={(v) => { setModel(v); setFormat('auto'); setCount('1'); }} options={[{ value: 'auto', label: 'Auto' }, ...catalog.image.map((m) => ({ value: m.id, label: m.name }))]} />
          <Select label="Number of images" value={count} onChange={setCount} options={Array.from({ length: maxCount }, (_, i) => ({ value: String(i + 1), label: `${i + 1} image${i ? 's' : ''}` }))} />
        </div>
        <div className="row">
          {busy ? <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button> : <button className="btn primary" disabled={!prompt.trim() || connected.size === 0} onClick={generate}>Generate</button>}
          {busy && !getSettings().terminal && <span className="muted small" role="status">Generating. This can take up to a minute.</span>}
        </div>
        {busy && !getSettings().terminal && <div className="progress" aria-hidden="true"><div /></div>}
      </div>
      {getSettings().terminal && <Terminal log={log} title="Image workflow" />}
      {msg && <div className={`notice${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</div>}
      {items.length > 0 && (
        <div className="grid">
          {items.map(({ rec, url }) => (
            <figure key={rec.id} className="tile">
              <img src={url} alt={rec.name.replace('.png', '').replace(/-/g, ' ')} loading="lazy" />
              <figcaption>
                <button className="btn" onClick={async () => { const r = await platform.saveFile(rec.blob, rec.name); if (r === 'saved') setMsg({ text: `Saved ${rec.name}.` }); }}>Download</button>
                <button className="btn" onClick={async () => { await deleteMedia(rec.id); await load(); }}>Delete</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {items.length > 0 && <p className="muted small">Images live only on this device. Download the ones you want to keep.</p>}
    </section>
  );
}
