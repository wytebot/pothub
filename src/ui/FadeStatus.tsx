import { useRunLog, type RunLog } from '../agent/log';

/** Compact, user-safe timeline for an in-progress request. Technical workflow logs stay hidden. */
export function FadeStatus({ log, fallback = 'Getting started…' }: { log?: RunLog | null; fallback?: string }) {
  const steps = useRunLog(log).filter((l) => l.kind === 'step');
  const shown = steps.slice(-4);
  if (!shown.length) return <div className="task-timeline" role="status" aria-live="polite"><span className="task-timeline-dot active"/><span className="task-timeline-label">{fallback}</span><span className="task-timeline-pulse" aria-hidden="true"/></div>;
  const current = shown[shown.length - 1];
  return <div className="task-timeline" role="status" aria-live="polite" aria-label="Task progress">
    <div className="task-timeline-track" aria-hidden="true">{shown.map((l, i) => <span key={l.id} className={`task-timeline-dot ${i === shown.length - 1 ? 'active' : 'complete'}`} />)}</div>
    <div className="task-timeline-copy">
      {shown.map((l, i) => <span key={l.id} className={`task-timeline-step ${i === shown.length - 1 ? 'current' : 'previous'}`}>{l.text}</span>)}
    </div>
    <span className="task-timeline-pulse" aria-hidden="true"/>
    <span className="sr-only">Current step: {current.text}</span>
  </div>;
}
