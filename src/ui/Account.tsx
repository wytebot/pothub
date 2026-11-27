import { useState } from 'react';
import { signOut, useMe, type Me } from '../auth/session';

const initial = (m: Me) => (m.name || m.email || '?').slice(0, 1).toUpperCase();

/** Account details and sign-out. Signing in happens once, on the welcome page. */
export function AccountPanel({ note }: { note?: string }) {
  const me = useMe(); const [busy, setBusy] = useState(false);
  if (!me) return null;
  return (
    <div className="panel stack">
      <h2>Your account</h2>
      <div className="row nowrap">
        {me.photo ? <img className="avatar-lg" src={me.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar avatar-lg">{initial(me)}</span>}
        <div className="grow"><div className="title">{me.name || 'Signed in'}</div><div className="muted small">{me.email}</div></div>
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); }}>Sign out</button>
      </div>
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}
