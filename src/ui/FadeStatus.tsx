import { useRunLog, type RunLog } from '../agent/log';

/**
 * What the person sees while the app works: the last few plain-language steps as soft text.
 * The newest one fades in and out gently; older ones sit above it, fainter. The technical workflow stays hidden.
 */
export function FadeStatus({ log, fallback = 'Getting started…' }: { log?: RunLog | null; fallback?: string }) {
  const steps = useRunLog(log).filter((l) => l.kind === 'step');
  const shown = steps.slice(-3);
  if (!shown.length) return <div className="fade-status" role="status"><span className="fade-line now" key="start">{fallback}</span></div>;
  return (
    <div className="fade-status" role="status" aria-live="polite">
      {shown.map((l, i) => {
        const age = shown.length - 1 - i;
        return <span key={l.id} className={`fade-line ${age === 0 ? 'now' : age === 1 ? 'prev' : 'old'}`}>{l.text}</span>;
      })}
    </div>
  );
}
