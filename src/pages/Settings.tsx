import { useEffect, useState } from 'react';
import { getSettings, saveSettings, type Settings as S } from '../settings';
import { backgroundAvailable } from '../agent/background';
import { disableNotifications, enableNotifications, notifyPermission, notifyWanted, type NotifyPermission } from '../notify';

export function Settings() {
  const [s, setS] = useState<S>(getSettings());
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
      <div className="panel stack"><h2>Text models</h2><p className="muted small">MonyGist routes text, writing, research and code requests to connected providers. Models are selected automatically for quality or speed.</p><p>Preferred text model: <strong>Automatic routing</strong></p></div>
      <div className="panel stack"><h2>Workflow</h2>
        <label className="check"><input type="checkbox" checked={s.terminal} onChange={(e) => set({ terminal: e.target.checked })} /> Show the live step-by-step terminal while the assistant works</label>
      </div>
      <div className="panel stack"><h2>Background jobs</h2>
        <div className="notice"><strong>Background processing is always enabled.</strong><p>Chat answers are handed to the durable server job queue so they can continue when you leave the chat or app. This requires the configured job service and worker to be online.</p>{!backgroundAvailable()&&<p className="error">Background job service is not configured in this build.</p>}</div>
        <p className="muted small">{backgroundAvailable() ? 'Answers are saved by the MonyGist durable job service and can continue while you leave the app. Completed results are retained for up to 30 days. Your provider key is sent over HTTPS for the job, encrypted for queue storage, never logged, and erased when the job completes.' : 'Durable background jobs are unavailable in this build. Configure VITE_API_URL and deploy the MonyGist job service and worker before sending requests; otherwise answers cannot be guaranteed to continue after you leave.'}</p>
      </div>
      <div className="panel stack"><h2>Notifications</h2>
        <label className="check"><input type="checkbox" checked={notify && perm === 'granted'} disabled={perm === 'unsupported'} onChange={(e) => void toggleNotify(e.target.checked)} /> Notify me when an answer is ready and I’m not in MonyGist</label>
        <p className="muted small">{perm === 'unsupported' ? 'This browser does not support notifications.' : perm === 'denied' ? 'Notifications are blocked for MonyGist. Allow them in your device or browser settings, then switch this on again.' : 'Nothing pops up while you are looking at MonyGist. Notifications arrive while the app is open in the background; if your phone fully closes it, you will see the result next time you open it.'}</p>
      </div>
      <div className="panel"><h2>More</h2><p className="muted small">Keys: <a href="#/providers">AI Providers</a>. Space and backups: <a href="#/storage">Storage</a>. Policies: <a href="#/legal">Legal documents</a>.</p></div>
    </section>
  );
}
