import React from 'react';
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import Sheet from './Sheet.jsx';

const dashboardFor = (scope) => (scope?.slug ? `https://vercel.com/${encodeURIComponent(scope.slug)}` : 'https://vercel.com/dashboard');
const label = (scope) => (scope?.isDefault || (!scope?.slug && !scope?.teamId) ? (scope?.slug ? `${scope.slug} (default)` : 'Default scope') : scope.name || scope.slug || scope.teamId);

/**
 * Reauthentication for Vercel scopes. Vercel refuses a scope (a team, or SAML-protected account) until the person
 * proves it is them. Three ways forward, all verified by Vercel itself, PotHub never sees a password or email code:
 *   1. Confirm on Vercel (its own page does SAML / email verification), then press "Check again".
 *   2. Sign in with Vercel again (fresh login).
 *   3. Paste a token created for exactly that scope. PotHub tests it against the scope before saving and keeps it
 *      encrypted, used only for that scope.
 */
export default function ReauthSheet({ api, open, onClose, focus, onResolved, onReconnect, onNotice }) {
  const [scopes, setScopes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [active, setActive] = React.useState(null); // scope whose token form is open
  const [token, setToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  const check = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await api('/api/vercel/reauth/scopes', { timeoutMs: 40000 });
      const list = d.scopes || [];
      setScopes(list);
      if (list.length && list.every((x) => x.state === 'ok')) onResolved?.(list);
      return list;
    } catch (e) { setError(String(e?.message || e)); return []; }
    finally { setLoading(false); }
  }, [api, onResolved]);

  React.useEffect(() => { if (open) { setToken(''); setFormError(''); check(); } }, [open, check]);

  // Open the token form for the scope Vercel complained about.
  React.useEffect(() => {
    if (!open || !scopes.length || active) return;
    const f = String(focus || '').toLowerCase();
    const hit = scopes.find((x) => x.state === 'reauth_required' && (!f || String(x.slug).toLowerCase() === f || x.teamId === focus)) || scopes.find((x) => x.state === 'reauth_required');
    if (hit) setActive(hit);
  }, [open, scopes, focus, active]);

  // Returning from Vercel's own page: check again automatically.
  React.useEffect(() => {
    if (!open) return undefined;
    const back = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [open, check]);

  async function save(event) {
    event.preventDefault();
    if (busy || !active || token.trim().length < 20) return;
    setBusy(true); setFormError('');
    try {
      await api('/api/vercel/reauth/token', { method: 'POST', body: JSON.stringify({ token: token.trim(), teamId: active.teamId || null, slug: active.slug || null }), timeoutMs: 40000, noRetry: true });
      setToken(''); setActive(null);
      onNotice?.(`Access to ${label(active)} confirmed.`);
      const list = await check();
      if (!list.length || list.every((x) => x.state === 'ok')) onResolved?.(list);
      else onResolved?.(list, { partial: true });
    } catch (e) { setFormError(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  async function forget(scope) {
    setBusy(true); setFormError('');
    try { await api(`/api/vercel/reauth/token?teamId=${encodeURIComponent(scope.teamId)}`, { method: 'DELETE', noRetry: true }); await check(); }
    catch (e) { setFormError(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  const needs = scopes.filter((x) => x.state !== 'ok');
  return (
    <Sheet open={open} onClose={onClose} busy={busy} title="Confirm Vercel access" subtitle="Vercel asked you to re-authenticate for a scope"
      footer={<button type="button" className="primary" onClick={check} disabled={loading || busy}><RefreshCw size={16} className={loading ? 'spin' : ''} aria-hidden="true" /> {loading ? 'Checking…' : 'Check again'}</button>}>
      <div className="vx-stack">
        {error && <p className="vx-field-error" role="alert">{error}</p>}
        {!loading && !error && scopes.length > 0 && needs.length === 0 && <div className="vx-notice" role="status"><CheckCircle2 size={20} aria-hidden="true" /><div><strong>Everything is confirmed</strong><p>Every Vercel scope on this account is reachable.</p></div></div>}
        <ul className="vx-scope-list">
          {scopes.map((sc) => {
            const bad = sc.state !== 'ok', open_ = active && active.teamId === sc.teamId && active.slug === sc.slug;
            return (
              <li key={`${sc.teamId}:${sc.slug}`} className={`vx-scope ${bad ? 'bad' : 'good'}`}>
                <div className="vx-scope-head">
                  {bad ? <ShieldAlert size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
                  <strong>{label(sc)}</strong>
                  <span className="vx-scope-state">{sc.state === 'ok' ? 'Confirmed' : sc.state === 'reauth_required' ? 'Needs confirmation' : 'Error'}</span>
                </div>
                {bad && sc.message && <p className="vx-hint">{sc.message}</p>}
                {bad && !open_ && (
                  <div className="vx-scope-actions">
                    <a className="secondary vx-small" href={dashboardFor(sc)} target="_blank" rel="noreferrer">1. Confirm on Vercel <ExternalLink size={13} aria-hidden="true" /></a>
                    <button type="button" className="secondary vx-small" onClick={() => onReconnect?.()}>2. Sign in again</button>
                    <button type="button" className="secondary vx-small" onClick={() => { setActive(sc); setFormError(''); }}><KeyRound size={13} aria-hidden="true" /> 3. Use a token</button>
                  </div>
                )}
                {bad && open_ && (
                  <form onSubmit={save} className="vx-token-form">
                    <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={`Token for ${label(sc)}`} aria-label="Vercel access token" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
                    <button type="submit" className="primary" disabled={busy || token.trim().length < 20}>{busy ? 'Testing…' : 'Verify & save'}</button>
                    <p className="vx-hint">Create it at <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer">vercel.com/account/settings/tokens</a> and choose <strong>{sc.slug || 'this scope'}</strong> as its scope. PotHub tests it on that scope first, stores it encrypted, and uses it only there.</p>
                    {formError && <p className="vx-field-error" role="alert">{formError}</p>}
                    <button type="button" className="secondary vx-small" onClick={() => { setActive(null); setToken(''); setFormError(''); }}>Cancel</button>
                  </form>
                )}
                {!bad && sc.hasScopeToken && !sc.isDefault && <button type="button" className="secondary vx-small" onClick={() => forget(sc)} disabled={busy}><Trash2 size={13} aria-hidden="true" /> Remove saved token</button>}
              </li>
            );
          })}
        </ul>
        <p className="vx-hint">If Vercel emails you a verification code, type it on Vercel’s page, never here. Then come back and PotHub re-checks by itself.</p>
      </div>
    </Sheet>
  );
}
