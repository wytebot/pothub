import { useEffect, useState } from 'react';
import { getSettings, saveSettings, type Settings as S } from '../settings';
import { cachedCatalog, refreshCatalog } from '../agent/detect';
import { Select } from '../ui/Select';

export function Settings() {
  const [s, setS] = useState<S>(getSettings());
  const [cat, setCat] = useState(cachedCatalog);
  useEffect(() => { void refreshCatalog().then(setCat); }, []);
  const set = (p: Partial<S>) => { const n = { ...s, ...p }; setS(n); saveSettings(n); };
  return (
    <section className="page">
      <h1>Settings</h1>
      <div className="panel stack"><h2>Generation</h2>
        <p className="muted small">Preferred models are used when Auto picks a model and the preferred one can do the job (it is connected and supports the requested shape).</p>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Image model</span><Select label="Preferred image model" value={s.imageModel} onChange={(v) => set({ imageModel: v })} options={[{ value: 'auto', label: 'Auto' }, ...cat.image.map((m) => ({ value: m.id, label: m.name }))]} /></div>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Video model</span><Select label="Preferred video model" value={s.videoModel} onChange={(v) => set({ videoModel: v })} options={[{ value: 'auto', label: 'Auto' }, ...cat.video.map((m) => ({ value: m.id, label: m.name }))]} /></div>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Default priority</span><Select<'quality' | 'speed'> label="Default priority" value={s.priority} onChange={(v) => set({ priority: v })} options={[{ value: 'quality', label: 'Best quality' }, { value: 'speed', label: 'Fastest' }]} /></div>
      </div>
      <div className="panel stack"><h2>Workflow</h2>
        <label className="check"><input type="checkbox" checked={s.terminal} onChange={(e) => set({ terminal: e.target.checked })} /> Show the live step-by-step terminal while generating</label>
        <label className="check"><input type="checkbox" checked={s.enhance} onChange={(e) => set({ enhance: e.target.checked })} /> Sharpen my prompts first with a fast Gemini text model (uses a few tokens on your Gemini key; needs one)</label>
        <p className="muted small">Type <code>/enhance</code> or <code>/plain</code> in a prompt to override this for one run.</p>
      </div>
      <div className="panel"><h2>More</h2><p className="muted small">Keys: <a href="#/providers">AI Providers</a>. Space and backups: <a href="#/storage">Storage</a>. Policies: <a href="#/legal">Legal documents</a>.</p></div>
    </section>
  );
}
