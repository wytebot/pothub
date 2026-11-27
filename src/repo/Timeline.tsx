import { useEffect, useRef, useState } from 'react';
import { useRunLog, type Line, type RunLog } from '../agent/log';

const fmt = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`);
const GLYPH: Record<Line['kind'], string> = { cmd: '$', info: '›', ok: '✓', warn: '!', err: '✕', step: '·', agent: '◆' };

function useNow(active: boolean) { const [, set] = useState(0); useEffect(() => { if (!active) return; const t = setInterval(() => set((n) => n + 1), 250); return () => clearInterval(t); }, [active]); return Date.now(); }

/**
 * A live timeline of everything the agents and the terminal are doing. The newest line is bright and the older ones fade,
 * so the eye stays on what is happening now. Agents (models) are listed on top with their current state.
 */
export function Timeline({ log, title = 'Live timeline' }: { log: RunLog; title?: string }) {
  const lines = useRunLog(log);
  const box = useRef<HTMLOListElement>(null);
  const running = lines.some((l) => l.state === 'running');
  const now = useNow(running);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length]);
  const agents = new Map<string, Line>();
  for (const l of lines) if (l.kind === 'agent') { const cur = agents.get(l.text); if (!cur || l.state === 'running' || cur.state !== 'running') agents.set(l.text, l); }
  const failed = lines.some((l) => l.state === 'failed' && l.kind === 'cmd');
  if (!lines.length) return <section className="tm tm-empty" aria-label={title}><p>Starting…</p></section>;
  const last = lines[lines.length - 1];
  return (
    <section className={`tm${running ? ' live' : ''}${failed && !running ? ' bad' : ''}`} aria-label={title}>
      <header className="tm-head">
        <span className="tm-title">{title}</span>
        <span className="tm-status">{running ? <><span className="spin" aria-hidden="true" />{last.text}</> : failed ? 'stopped' : 'finished'} · {fmt((running ? now : (last.t1 ?? last.t0)) - lines[0].t0)}</span>
      </header>
      {agents.size > 0 && (
        <div className="tm-agents" aria-label="Agents">
          {[...agents.values()].map((a) => (
            <span key={a.text} className={`tm-agent ${a.state}`} title={a.detail}>{a.state === 'running' ? <span className="spin" aria-hidden="true" /> : a.state === 'failed' ? '✕' : '◆'} {a.text}<small>{(a.detail || '').split(' · ')[1] ?? ''}</small></span>
          ))}
        </div>
      )}
      <ol className="tm-list" ref={box} role="log" aria-live="polite">
        {lines.map((l, i) => {
          const age = lines.length - 1 - i;
          const fade = l.state === 'running' ? 1 : Math.max(running ? 0.28 : 0.5, 1 - age * 0.085);
          const phase = l.kind === 'info' && /^Phase \d/.test(l.text);
          return (
            <li key={l.id} className={`tm-row ${l.kind} ${l.state}${phase ? ' phase' : ''}`} style={{ opacity: fade }}>
              <span className="tm-node" aria-hidden="true">{l.state === 'running' ? <span className="spin" /> : l.state === 'failed' ? '✕' : GLYPH[l.kind]}</span>
              <span className="tm-body"><span className={l.kind === 'cmd' ? 'tm-cmd' : 'tm-text'}>{l.text}</span>{l.detail && <span className="tm-detail">{l.detail}</span>}</span>
              <span className="tm-time">{l.state === 'running' ? fmt(now - l.t0) : l.t1 && l.t1 - l.t0 > 400 ? fmt(l.t1 - l.t0) : ''}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
