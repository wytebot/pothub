import { useEffect, useState } from 'react';
import { fmtBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../storage/quota';
import { mediaCount, listProjects } from '../storage/db';

export function Storage() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [counts, setCounts] = useState<{ projects: number; media: number } | null>(null);
  const [note, setNote] = useState('');
  const load = async () => { setInfo(await getStorageInfo()); setCounts({ projects: (await listProjects()).length, media: await mediaCount() }); };
  useEffect(() => { void load().catch(() => setNote('Storage details are not available in this browser.')); }, []);
  const pct = info && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;

  return (
    <section className="page">
      <h1>Storage</h1>
      <div className="notice warn" role="note">
        Your projects and media are stored only on this device. Uninstalling the app, clearing browser data, resetting the device or running a storage cleaner can permanently delete them. There is no cloud backup. Export projects as ZIP files to keep them safe.
      </div>
      <div className="panel">
        {info?.supported ? (<>
          <div className="meter" role="img" aria-label={`${pct.toFixed(1)} percent of available storage used`}><div style={{ width: `${Math.max(pct, 0.5)}%` }} /></div>
          <p>{fmtBytes(info.usage)} used of about {fmtBytes(info.quota)} available to this app.</p>
          <p className="muted">{counts ? `${counts.projects} project(s), ${counts.media} media file(s).` : ''} The browser decides the quota and can change it.</p>
        </>) : <p className="muted">{note || 'Reading storage…'}</p>}
      </div>
      <div className="panel">
        <h2>Protect from automatic cleanup</h2>
        <p>{info?.persisted ? 'This browser has marked your data as persistent, so it is less likely to be removed when space runs low. Clearing site data manually still deletes it.' : 'Browsers may remove site data when the device is low on space. Asking for persistent storage reduces that risk, but the browser can refuse.'}</p>
        {!info?.persisted && info?.supported && <button className="btn" onClick={async () => { const ok = await requestPersistence(); setNote(ok ? 'Persistent storage granted.' : 'The browser did not grant persistent storage. Installing the app as a PWA often helps.'); await load(); }}>Request persistent storage</button>}
        {note && <p className="muted" role="status">{note}</p>}
      </div>
    </section>
  );
}
