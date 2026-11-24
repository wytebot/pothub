import { useEffect, useState } from 'react';
import { signInWithGoogle } from '../auth/session';

const lines = ['Diagnose failed builds with real repository evidence.', 'Repair code safely through reviewed GitHub pull requests.', 'Monitor GitHub Actions and Vercel deployments.', 'Choose the AI model that works best for your codebase.'];

export function Welcome({ onExplore }: { onExplore: () => void }) {
  const [line, setLine] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => sessionStorage.getItem('auth.redirectError') ?? '');
  useEffect(() => {
    const show = () => setError(sessionStorage.getItem('auth.redirectError') ?? '');
    window.addEventListener('auth:redirect-error', show);
    sessionStorage.removeItem('auth.redirectError');
    return () => window.removeEventListener('auth:redirect-error', show);
  }, []);
  useEffect(() => { const t = window.setInterval(() => setLine((n) => (n + 1) % lines.length), 3200); return () => clearInterval(t); }, []);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { localStorage.setItem('pothub.welcome.seen','1'); } catch { /* continue without persistent preference */ }
    try {
      const r = await signInWithGoogle();
      if (!r.ok) setError(r.message);
    } catch {
      setError('Google sign-in could not be started. Check your connection and try again.');
    } finally {
      // A successful browser redirect unloads this page. This only runs when
      // navigation did not happen (for example, Firebase rejected the request).
      setBusy(false);
    }
  };
  return (
    <div className="welcome welcome-code">
      <main className="welcome-content welcome-ide">
        <div className="welcome-mark"><span>&lt;/&gt;</span><strong>Pothub</strong></div>
        <div className="welcome-codecard" aria-hidden="true"><div className="welcome-codebar"><i/><i/><i/><span>workspace.ts</span></div><pre><b>const</b> workspace = {'{'}<br/>  <em>mode</em>: <q>developer</q>,<br/>  <em>research</em>: <q>web + sources</q>,<br/>  <em>models</em>: <q>your keys, your choice</q><br/>{'}'};<br/><br/><b>await</b> pothub.build(workspace);</pre></div>
        <h1>Your software doctor.</h1>
        <p className="welcome-rotating" aria-live="polite"><span key={line}>{lines[line]}</span></p>
        <div className="welcome-actions"><button className="start" onClick={start} disabled={busy}>{busy ? 'Opening Google…' : 'Continue with Google'}</button><button className="btn" onClick={()=>{try{localStorage.setItem('pothub.welcome.seen','1')}catch{}onExplore()}}>Explore without signing in</button><small>GitHub-first debugging · Verified repairs · Vercel monitoring</small></div>
        {error && <p className="error-text small" role="alert">{error}</p>}
      </main>
    </div>
  );
}
