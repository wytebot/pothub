import type { CSSProperties } from 'react';

const art = [
  { src: 'dunes', x: '4%', y: '10%', w: 'clamp(150px,22vw,300px)', d: 28, delay: 0.1, r: -5 },
  { src: 'forest', x: '74%', y: '6%', w: 'clamp(110px,15vw,210px)', d: 34, delay: 0.5, r: 4 },
  { src: 'city', x: '70%', y: '56%', w: 'clamp(150px,22vw,310px)', d: 30, delay: 0.9, r: -3 },
  { src: 'aurora', x: '10%', y: '62%', w: 'clamp(150px,21vw,290px)', d: 36, delay: 1.3, r: 3 },
  { src: 'planet', x: '40%', y: '70%', w: 'clamp(90px,12vw,170px)', d: 32, delay: 1.7, r: -4 },
  { src: 'ocean', x: '42%', y: '3%', w: 'clamp(120px,16vw,230px)', d: 38, delay: 2.1, r: 5 },
];

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="welcome">
      {art.map((a) => (
        <img key={a.src} className="float" src={`/welcome/${a.src}.svg`} alt="" draggable={false}
          style={{ left: a.x, top: a.y, width: a.w, '--d': `${a.d}s`, '--delay': `${a.delay}s`, '--r': `${a.r}deg` } as CSSProperties} />
      ))}
      <div className="welcome-vignette" />
      <main className="welcome-content">
        <h1>Pothub</h1>
        <p>Generate images and video with your own AI keys, then shape them into finished work. Everything stays on your device.</p>
        <button className="start" autoFocus onClick={onStart}>Start creating</button>
      </main>
    </div>
  );
}
