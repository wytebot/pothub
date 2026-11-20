import { useEffect, useState } from 'react';
import { signInWithGoogle } from '../auth/session';

const lines = ['Code, research and writing in one workspace.', 'Bring your own model keys.', 'Build, debug and understand projects.', 'Read files locally. Keep your work private.'];

export function Welcome() {
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
        <h1>Think. Build. Ship.</h1>
        <p className="welcome-rotating" aria-live="polite"><span key={line}>{lines[line]}</span></p>
        <div className="welcome-actions"><button className="start" onClick={start} disabled={busy}>{busy ? 'Opening Google…' : 'Continue with Google'}</button><small>Text-first AI workspace · BYOK · Developer tools</small></div>
        {error && <p className="error-text small" role="alert">{error}</p>}
      </main>
    </div>
  );
}
