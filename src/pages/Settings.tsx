import { useEffect, useState } from 'react';
import { getSettings, saveSettings, type Settings as S } from '../settings';
import { cachedCatalog, refreshCatalog } from '../agent/detect';
import { Select } from '../ui/Select';
import { disableNotifications, enableNotifications, notifyPermission, notifyWanted, type NotifyPermission } from '../notify';

export function Settings() {
  const [s, setS] = useState<S>(getSettings());
  const [cat, setCat] = useState(cachedCatalog);
  useEffect(() => { void refreshCatalog().then(setCat); }, []);
  const [notify, setNotify] = useState(notifyWanted());
  const [perm, setPerm] = useState<NotifyPermission>('default');
  useEffect(() => { void notifyPermission().then(setPerm); }, []);
  const toggleNotify = async (on: boolean) => {
    if (!on) { disableNotifications(); setNotify(false); return; }
    const r = await enableNotifications(); setPerm(r); setNotify(r === 'granted');
  };
  const set = (p: Partial<S>) => { const n = { ...s, ...p }; setS(n); saveSettings(n); };
  return (
    <section className="page">
      <h1>Settings</h1>
      <div className="panel stack"><h2>Generation</h2>
        <p className="muted small">Preferred models are used when Auto picks a model and the preferred one can do the job (it is connected and supports the requested shape).</p>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Text model</span><Select label="Preferred text model" value={s.textModel} onChange={(v) => set({ textModel: v })} options={[{ value: 'auto', label: 'Auto' }, ...cat.texts.map((m) => ({ value: m.id, label: m.name }))]} /></div>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Image model</span><Select label="Preferred image model" value={s.imageModel} onChange={(v) => set({ imageModel: v })} options={[{ value: 'auto', label: 'Auto' }, ...cat.image.map((m) => ({ value: m.id, label: m.name }))]} /></div>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Video model</span><Select label="Preferred video model" value={s.videoModel} onChange={(v) => set({ videoModel: v })} options={[{ value: 'auto', label: 'Auto' }, ...cat.video.map((m) => ({ value: m.id, label: m.name }))]} /></div>
        <div className="row"><span className="muted small" style={{ width: 130 }}>Default priority</span><Select<'quality' | 'speed'> label="Default priority" value={s.priority} onChange={(v) => set({ priority: v })} options={[{ value: 'quality', label: 'Best quality' }, { value: 'speed', label: 'Fastest' }]} /></div>
      </div>
      <div className="panel stack"><h2>Workflow</h2>
        <label className="check"><input type="checkbox" checked={s.terminal} onChange={(e) => set({ terminal: e.target.checked })} /> Show the live step-by-step terminal in the Image and Video studios</label>
        <label className="check"><input type="checkbox" checked={s.enhance} onChange={(e) => set({ enhance: e.target.checked })} /> Sharpen my prompts first before generating (off by default; sends the prompt to Google Gemini and needs a Gemini key ticked for Text &amp; documents; the image or video itself still uses only your Images or Video provider)</label>
      </div>
      <div className="panel stack"><h2>Notifications</h2>
        <label className="check"><input type="checkbox" checked={notify && perm === 'granted'} disabled={perm === 'unsupported'} onChange={(e) => void toggleNotify(e.target.checked)} /> Notify me when an image, video or answer is ready and I’m not in Pothub</label>
        <p className="muted small">{perm === 'unsupported' ? 'This browser does not support notifications.' : perm === 'denied' ? 'Notifications are blocked for Pothub. Allow them in your device or browser settings, then switch this on again.' : 'Nothing pops up while you are looking at Pothub. Notifications arrive while the app is open in the background; if your phone fully closes it, you will see the result next time you open it.'}</p>
      </div>
      <div className="panel"><h2>More</h2><p className="muted small">Keys: <a href="#/providers">AI Providers</a>. Space and backups: <a href="#/storage">Storage</a>. Policies: <a href="#/legal">Legal documents</a>.</p></div>
    </section>
  );
}
