import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { signInWithGoogle } from '../auth/session';

const art = [
  { src: 'dunes', x: '2%', y: '9%', w: 'clamp(170px,25vw,340px)', d: 11, delay: 0, r: -10, dx: 70, dy: -90 },
  { src: 'forest', x: '76%', y: '5%', w: 'clamp(130px,18vw,240px)', d: 13, delay: .3, r: 9, dx: -80, dy: 70 },
  { src: 'city', x: '72%', y: '58%', w: 'clamp(170px,24vw,330px)', d: 12, delay: .6, r: -7, dx: -60, dy: -100 },
  { src: 'aurora', x: '7%', y: '62%', w: 'clamp(170px,23vw,310px)', d: 14, delay: .9, r: 8, dx: 90, dy: -60 },
  { src: 'planet', x: '42%', y: '73%', w: 'clamp(100px,14vw,190px)', d: 9, delay: 1.2, r: -12, dx: 50, dy: -80 },
  { src: 'ocean', x: '40%', y: '1%', w: 'clamp(140px,19vw,260px)', d: 12, delay: 1.5, r: 8, dx: -70, dy: 80 },
];
const lines = ['Make an idea visible.', 'Create images and motion.', 'Bring your imagination to life.', 'One prompt. More possibilities.', 'Pick any AI. Keep your keys.', 'Your work stays on your device.'];

export function Welcome() {
  const [line, setLine] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => sessionStorage.getItem('auth.redirectError') ?? '');
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = () => setError(sessionStorage.getItem('auth.redirectError') ?? '');
    window.addEventListener('auth:redirect-error', show);
    sessionStorage.removeItem('auth.redirectError');
    return () => window.removeEventListener('auth:redirect-error', show);
  }, []);
  useEffect(() => { const t = window.setInterval(() => setLine((n) => (n + 1) % lines.length), 2400); return () => clearInterval(t); }, []);
  // The scenery leans toward the pointer or tilts with the finger, so the page is alive even before anything is pressed.
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const move = (x: number, y: number) => { el.style.setProperty('--px', String((x / innerWidth - 0.5) * 2)); el.style.setProperty('--py', String((y / innerHeight - 0.5) * 2)); };
    const m = (e: PointerEvent) => move(e.clientX, e.clientY);
    addEventListener('pointermove', m); return () => removeEventListener('pointermove', m);
  }, []);
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
    <div className="welcome" ref={stage}>
      <div className="aurora-bg" aria-hidden="true"><i /><i /><i /></div>
      {art.map((a) => (
        <div key={a.src} className="float-wrap" style={{ left: a.x, top: a.y, width: a.w }}>
          <img className="float" src={`/welcome/${a.src}.svg`} alt="" draggable={false} style={{ '--d': `${a.d}s`, '--delay': `${a.delay}s`, '--r': `${a.r}deg`, '--dx': `${a.dx}px`, '--dy': `${a.dy}px` } as CSSProperties} />
        </div>
      ))}
      <div className="welcome-vignette" />
      <main className="welcome-content">
        <h1>Pothub</h1>
        <p className="welcome-rotating" aria-live="polite"><span key={line}>{lines[line]}</span></p>
        <button className="start" onClick={start} disabled={busy}>{busy ? 'Opening Google…' : 'Start creating'}</button>
        {error && <p className="error-text small" role="alert">{error}</p>}
      </main>
    </div>
  );
}
