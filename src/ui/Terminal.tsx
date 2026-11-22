import { useEffect, useRef, useState } from 'react';
import { useRunLog, type Line, type RunLog } from '../agent/log';

const fmt = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`);
const GLYPH: Record<Line['kind'], string> = { cmd: '$', info: '›', ok: '✓', warn: '!', err: '✕', step: '·' };

function useNow(active: boolean) { const [, set] = useState(0); useEffect(() => { if (!active) return; const t = setInterval(() => set((n) => n + 1), 250); return () => clearInterval(t); }, [active]); return Date.now(); }

/** Live, terminal-style feed of what the app is doing. Lines appear as soon as a step starts; running steps show a spinner and a live timer. */
export function Terminal({ log, title = 'Workflow', defaultOpen = true }: { log: RunLog; title?: string; defaultOpen?: boolean }) {
  const lines = useRunLog(log);
  const [open, setOpen] = useState(() => (localStorage.getItem('ui.terminal') ?? (defaultOpen ? '1' : '0')) === '1');
  const box = useRef<HTMLDivElement>(null);
  const running = lines.some((l) => l.state === 'running');
  const now = useNow(running);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length, open]);
  if (!lines.length) return null;
  const last = lines[lines.length - 1]; const first = lines[0];
  const failed = lines.some((l) => l.state === 'failed' && l.kind === 'cmd');
  const toggle = () => setOpen((o) => { localStorage.setItem('ui.terminal', o ? '0' : '1'); return !o; });

  return (
    <div className={`term${running ? ' live' : ''}${failed && !running ? ' bad' : ''}`}>
      <button className="term-head" onClick={toggle} aria-expanded={open}>
        <span className="term-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="term-title">{title}</span>
        <span className="term-status">{running ? <><span className="spin" aria-hidden="true" />{last.text.replace(/^pothub /, '')}</> : failed ? 'stopped' : 'finished'} · {fmt((running ? now : (last.t1 ?? last.t0)) - first.t0)}</span>
        <span className="term-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="term-body" ref={box} role="log" aria-live="polite" aria-label="Workflow output">
          {lines.map((l) => (
            <div key={l.id} className={`tl ${l.kind} ${l.state}`}>
              <span className="tg" aria-hidden="true">{l.state === 'running' ? <span className="spin" /> : l.state === 'failed' ? '✕' : l.kind === 'cmd' ? '$' : GLYPH[l.kind]}</span>
              <span className="tt"><span className={l.kind === 'cmd' ? 'cmdtext' : ''} style={l.kind === 'cmd' ? ({ '--n': Math.min(l.text.length, 90) } as React.CSSProperties) : undefined}>{l.text}</span>{l.detail && <span className="td">{l.detail}</span>}</span>
              <span className="tm">{l.state === 'running' ? fmt(now - l.t0) : l.t1 && l.t1 - l.t0 > 400 ? fmt(l.t1 - l.t0) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
