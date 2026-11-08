import React from 'react';
import { ExternalLink, KeyRound } from 'lucide-react';

/**
 * "Sign in with Vercel" connections cannot create projects (Vercel keeps those API permissions in private beta), so
 * Vercel answers "You don't have permission to create the project". A personal access token created by the person
 * works for every project action, and the Vercel import page works with no token at all.
 */
export default function AccessTokenCard({ api, importUrl, onSaved, onNotice }) {
  const [token, setToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  async function save(event) {
    event.preventDefault();
    if (busy || !token.trim()) return;
    setBusy(true); setError('');
    try {
      const d = await api('/api/vercel/access-token', { method: 'POST', body: JSON.stringify({ token: token.trim() }), timeoutMs: 25000, noRetry: true });
      setToken('');
      onNotice?.(`Vercel access token saved${d?.username ? ` for ${d.username}` : ''}. Try the import again.`);
      onSaved?.();
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="vx-notice warn" role="alert">
      <KeyRound size={20} aria-hidden="true" />
      <div>
        <strong>Vercel didn’t allow PotHub to create this project</strong>
        <p>Vercel doesn’t let “Sign in with Vercel” connections create projects yet. Fix it once by adding a Vercel access token, or import this repository directly on Vercel.</p>
        <form onSubmit={save} className="vx-token-form">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste Vercel access token" aria-label="Vercel access token" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
          <button type="submit" className="primary" disabled={busy || token.trim().length < 20}>{busy ? 'Checking…' : 'Save token'}</button>
        </form>
        <p className="vx-hint">Create it at <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer">vercel.com/account/settings/tokens</a>. Pick the scope (your account or team) that should own the project. The token is encrypted on the server and never shown again.</p>
        {error && <p className="vx-field-error">{error}</p>}
        {importUrl && <a className="secondary vx-open-link" href={importUrl} target="_blank" rel="noreferrer">Open in Vercel <ExternalLink size={14} aria-hidden="true" /></a>}
      </div>
    </div>
  );
}
