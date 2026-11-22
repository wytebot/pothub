import { useEffect, useState } from 'react';
import { getSettings, saveSettings, type Settings as S } from '../settings';
import { backgroundAvailable, backgroundOn, setBackground } from '../agent/background';
import { disableNotifications, enableNotifications, notifyPermission, notifyWanted, type NotifyPermission } from '../notify';

export function Settings() {
  const [s, setS] = useState<S>(getSettings());
  const [notify, setNotify] = useState(notifyWanted());
  const [bg, setBg] = useState(backgroundOn());
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
      <div className="panel stack"><h2>Text models</h2><p className="muted small">Pothub routes text, writing, research and code requests to connected providers. Models are selected automatically for quality or speed.</p><p>Preferred text model: <strong>Automatic routing</strong></p></div>
      <div className="panel stack"><h2>Workflow</h2>
        <label className="check"><input type="checkbox" checked={s.terminal} onChange={(e) => set({ terminal: e.target.checked })} /> Show the live step-by-step terminal while the assistant works</label>
      </div>
      <div className="panel stack"><h2>Background jobs</h2>
        <label className="check"><input type="checkbox" checked={bg && backgroundAvailable()} disabled={!backgroundAvailable()} onChange={(e) => { setBackground(e.target.checked); setBg(e.target.checked); }} /> Keep jobs running when I leave the app</label>
        <p className="muted small">{backgroundAvailable() ? 'Answers are written by the Pothub server, so they finish even if you close the app or lose signal, and are waiting for you when you come back (kept for 48 hours). Leaving the app does not cancel an active job; it continues on the server and is picked up when you return. Your provider key is sent to the server over HTTPS for that one job only: it is held in memory, never saved or logged, and dropped when the job ends. Switch this off to run jobs only on this device.' : 'Background jobs need the Pothub server, which is not configured for this build. Jobs run on this device.'}</p>
      </div>
      <div className="panel stack"><h2>Notifications</h2>
        <label className="check"><input type="checkbox" checked={notify && perm === 'granted'} disabled={perm === 'unsupported'} onChange={(e) => void toggleNotify(e.target.checked)} /> Notify me when an answer is ready and I’m not in Pothub</label>
        <p className="muted small">{perm === 'unsupported' ? 'This browser does not support notifications.' : perm === 'denied' ? 'Notifications are blocked for Pothub. Allow them in your device or browser settings, then switch this on again.' : 'Nothing pops up while you are looking at Pothub. Notifications arrive while the app is open in the background; if your phone fully closes it, you will see the result next time you open it.'}</p>
      </div>
      <div className="panel"><h2>More</h2><p className="muted small">Keys: <a href="#/providers">AI Providers</a>. Space and backups: <a href="#/storage">Storage</a>. Policies: <a href="#/legal">Legal documents</a>.</p></div>
    </section>
  );
}
