import { useEffect, useState } from 'react';
import { useMe } from '../auth/session';
import { CLOUD_CHANGED, cloudDirty, cloudEnabled, cloudState, deleteCloudCopy, lastCloudSync, resolveOtherAccount, setCloudEnabled, syncNow } from '../cloud/sync';

function useCloud() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); window.addEventListener(CLOUD_CHANGED, f); return () => window.removeEventListener(CLOUD_CHANGED, f); }, []);
  return cloudState();
}

/** Sync with the person's own Google Drive: chats and projects follow them to any device they sign in on. */
export function CloudSyncPanel() {
  const me = useMe(); const st = useCloud(); const [busy, setBusy] = useState(false);
  if (!me) return null;
  const on = cloudEnabled(); const last = lastCloudSync();
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const syncing = st.status === 'syncing';
  const headline = !on ? 'Sync is off' : syncing ? 'Syncing…' : st.status === 'idle' ? (last ? `Up to date · last synced ${new Date(last).toLocaleString()}` : 'Ready to sync') : '';
  return (
    <div className="panel stack">
      <h2>Sync with Google Drive</h2>
      <p>Your chats and project records are kept in a private MonyGist folder in your own Google Drive, so they are waiting when you sign in on another device. Nothing is stored on MonyGist’s servers, and your provider keys are never synced.</p>
      <div className="sync-state small"><span><i className={`dot${on && (st.status === 'idle' || syncing) ? ' on' : ''}`} />{headline || (on ? 'Needs attention' : '')}</span>{syncing && st.detail && <span className="muted">{st.detail}</span>}</div>
      {st.message && st.status !== 'idle' && <p className={st.status === 'off' ? 'muted small' : 'error-text'} role="status">{st.message}</p>}
      {st.status === 'idle' && st.message && <p className="muted small" role="status">{st.message}</p>}

      {st.status === 'other-account' && <div className="stack">
        <p>This device has chats and projects from a different account. Choose what to do with them:</p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => run(() => resolveOtherAccount('merge'))}>Add them to this account</button>
          <button className="btn danger" disabled={busy} onClick={() => { if (window.confirm('Erase chats and local data on this device and load this account’s instead?')) void run(() => resolveOtherAccount('replace')); }}>Erase and load this account</button>
        </div>
      </div>}

      <div className="row">
        {on
          ? <>
            <button className="btn primary" disabled={busy || syncing} onClick={() => run(() => syncNow(true))}>{st.status === 'needs-connect' || st.status === 'no-permission' ? 'Connect Google Drive' : syncing ? 'Syncing…' : 'Sync now'}</button>
            <button className="btn" disabled={busy || syncing} onClick={() => setCloudEnabled(false)}>Turn off</button>
            <button className="btn danger" disabled={busy || syncing} onClick={() => { if (window.confirm('Delete everything MonyGist keeps in your Google Drive? Chats and projects on your devices are not deleted.')) void run(deleteCloudCopy); }}>Delete cloud copy</button>
          </>
          : <button className="btn primary" disabled={busy} onClick={() => { setCloudEnabled(true); void run(() => syncNow(true)); }}>Turn on sync</button>}
      </div>
    </div>
  );
}

/** A quiet reminder, only when recent work could not be saved to Drive because Google access has lapsed. */
export function CloudNotice() {
  const me = useMe(); const st = useCloud(); const [hidden, setHidden] = useState(false);
  if (!me || hidden || !cloudEnabled() || st.status !== 'needs-connect' || !cloudDirty()) return null;
  return (
    <div className="notice" role="status">Your latest work has not been saved to Google Drive yet. <button className="btn" onClick={() => void syncNow(true)}>Reconnect</button> <button className="btn" onClick={() => setHidden(true)}>Later</button></div>
  );
}
