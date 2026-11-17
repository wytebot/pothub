import { useEffect, useState, type CSSProperties } from 'react';
import { signInWithGoogle } from '../auth/session';

const art = [
  { src: 'dunes', x: '2%', y: '9%', w: 'clamp(170px,25vw,340px)', d: 18, delay: 0, r: -8 },
  { src: 'forest', x: '76%', y: '5%', w: 'clamp(130px,18vw,240px)', d: 22, delay: .3, r: 7 },
  { src: 'city', x: '72%', y: '58%', w: 'clamp(170px,24vw,330px)', d: 20, delay: .6, r: -5 },
  { src: 'aurora', x: '7%', y: '62%', w: 'clamp(170px,23vw,310px)', d: 24, delay: .9, r: 5 },
  { src: 'planet', x: '42%', y: '73%', w: 'clamp(100px,14vw,190px)', d: 17, delay: 1.2, r: -6 },
  { src: 'ocean', x: '40%', y: '1%', w: 'clamp(140px,19vw,260px)', d: 21, delay: 1.5, r: 6 },
];
const lines = ['Make an idea visible.', 'Create images and motion.', 'Bring your imagination to life.', 'One prompt. More possibilities.'];

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
  useEffect(() => { const t = window.setInterval(() => setLine((n) => (n + 1) % lines.length), 2600); return () => clearInterval(t); }, []);
  const start = async () => { setBusy(true); setError(''); const r = await signInWithGoogle(); if (!r.ok) setError(r.message); setBusy(false); };
  return (
    <div className="welcome">
      {art.map((a) => <img key={a.src} className="float" src={`/welcome/${a.src}.svg`} alt="" draggable={false} style={{ left: a.x, top: a.y, width: a.w, '--d': `${a.d}s`, '--delay': `${a.delay}s`, '--r': `${a.r}deg` } as CSSProperties} />)}
      <div className="welcome-vignette" />
      <main className="welcome-content">
        <h1>Pothub</h1>
        <p className="welcome-rotating" aria-live="polite">{lines[line]}</p>
        <p className="welcome-sub">Create images and videos with the AI models you choose.</p>
        <button className="start" onClick={start} disabled={busy}>{busy ? 'Opening Google…' : 'Start creating'}</button>
        {error && <p className="error-text small" role="alert">{error}</p>}
      </main>
    </div>
  );
}
