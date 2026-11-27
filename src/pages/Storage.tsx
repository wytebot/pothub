import { useEffect, useState } from 'react';
import { fmtBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../storage/quota';
import { mediaCount, listProjects, allChats } from '../storage/db';
import { createBackup, restoreBackup } from '../storage/backup';
import { platform } from '../platform';

export function Storage() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [counts, setCounts] = useState<{ projects: number; media: number } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCounts, setBackupCounts] = useState<{ chats: number; projects: number; media: number } | null>(null);
  const load = async () => { setInfo(await getStorageInfo()); setCounts({ projects: (await listProjects()).length, media: await mediaCount() }); setBackupCounts({ chats: (await allChats()).length, projects: (await listProjects()).length, media: await mediaCount() }); };
  useEffect(() => { void load().catch(() => setNote('Storage details are not available in this browser.')); }, []);
  const pct = info && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;

  return (
    <section className="page">
      <h1>Storage</h1>
      <div className="notice warn" role="note">
        Your chats and local data are stored on this device. Old backups may include legacy media/project data from previous app versions; media tools are no longer available. Download a full backup regularly. Uninstalling the app, clearing browser data or resetting the device can permanently delete local data.
      </div>
      <div className="panel stack">
        <h2>Download backup</h2>
        <p>Save your chats and any legacy records into one ZIP backup. Keep it somewhere safe and make a new backup regularly.</p>
        <p className="muted small">{backupCounts ? `${backupCounts.chats} chats · ${backupCounts.projects} legacy projects · ${backupCounts.media} legacy media items (archive only)` : 'Counting your saved work…'}</p>
        <div className="row"><button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setNote('Preparing your backup…'); try { const b = await createBackup(); const saved = await platform.saveFile(b.blob, b.name); setNote(saved === 'saved' ? `Backup ready: ${b.counts.chats} chats and legacy data.` : 'Backup download cancelled. Your local data is unchanged.'); } catch (e) { setNote(e instanceof Error ? e.message : 'Could not create backup.'); } finally { setBusy(false); } }}>{busy ? 'Working…' : 'Download full backup'}</button>
        <label className="btn" style={{ cursor: busy ? 'wait' : 'pointer' }}>Restore backup<input type="file" accept=".zip,application/zip" disabled={busy} style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (!window.confirm('Restore this backup? Existing data will NOT be deleted. Matching items are updated only when the backup has a newer timestamp.')) return; setBusy(true); setNote('Checking backup and merging your saved work…'); try { const r = await restoreBackup(f); setNote(`Restore complete. Chats: ${r.chatsAdded} added, ${r.chatsUpdated} updated. Legacy records: ${r.projectsAdded + r.mediaAdded} added, ${r.projectsUpdated + r.mediaUpdated} updated. Existing unrelated data was kept.`); await load(); } catch (err) { setNote(err instanceof Error ? err.message : 'Could not restore backup.'); } finally { setBusy(false); } }} /></label></div>
        {note && <p className="muted small" role="status">{note}</p>}
      </div>
      <div className="panel">
        {info?.supported ? (<>
          <div className="meter" role="img" aria-label={`${pct.toFixed(1)} percent of available storage used`}><div style={{ width: `${Math.max(pct, 0.5)}%` }} /></div>
          <p>{fmtBytes(info.usage)} used of about {fmtBytes(info.quota)} available to this app.</p>
          <p className="muted">{counts ? `${counts.projects} archived legacy project(s), ${counts.media} archived legacy media record(s) retained for backup.` : ''} The browser decides the quota and can change it.</p>
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
