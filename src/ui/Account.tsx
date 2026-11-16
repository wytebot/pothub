import { useState } from 'react';
import { signInWithGoogle, signOut, useMe, type Me } from '../auth/session';

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.7 7l7.3 5.7c4.3-4 6.8-9.9 6.8-17.2z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
);
const initial = (m: Me) => (m.name || m.email || '?').slice(0, 1).toUpperCase();

/** Hook + button used by every sign-in surface. */
export function useSignIn() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); const r = await signInWithGoogle(); if (!r.ok) setErr(r.message); setBusy(false); };
  return { busy, err, go };
}
export function GoogleButton({ label = 'Continue with Google', onDone }: { label?: string; onDone?: () => void }) {
  const { busy, err, go } = useSignIn();
  return (
    <>
      <button className="btn google" disabled={busy} onClick={async () => { await go(); onDone?.(); }}><GoogleG />{busy ? 'Opening Google…' : label}</button>
      {err && <p className="error-text small" role="alert">{err}</p>}
    </>
  );
}

/** Compact account row at the bottom of the sidebar. */
export function SidebarAccount() {
  const me = useMe();
  if (me === undefined) return null;
  if (!me) return <div className="side-account"><GoogleButton label="Sign in with Google" /></div>;
  return (
    <a className="side-account me" href="#/billing" title="Account">
      {me.photo ? <img src={me.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{initial(me)}</span>}
      <span className="grow"><span className="title">{me.name || me.email}</span><span className="muted small">{me.name ? me.email : 'Signed in'}</span></span>
    </a>
  );
}

/** Full panel for the Account and Billing page. */
export function AccountPanel({ note }: { note?: string }) {
  const me = useMe(); const [busy, setBusy] = useState(false);
  return (
    <div className="panel stack">
      <h2>Your account</h2>
      {me === undefined ? <p className="muted">Checking sign-in…</p> : me ? (
        <>
          <div className="row nowrap">
            {me.photo ? <img className="avatar-lg" src={me.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar avatar-lg">{initial(me)}</span>}
            <div className="grow"><div className="title">{me.name || 'Signed in'}</div><div className="muted small">{me.email}</div></div>
            <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); }}>Sign out</button>
          </div>
          {note && <p className="muted small">{note}</p>}
        </>
      ) : (
        <>
          <p className="muted small">Sign in to keep your premium licence with your Google account, so you can restore it on any device. Your media and API keys stay on this device either way.</p>
          <div className="row"><GoogleButton /></div>
        </>
      )}
    </div>
  );
}
