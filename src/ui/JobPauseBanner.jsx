import React from 'react';
import { getPauseState, subscribePause } from '../lib/job-pause.js';

/** Shows when agent jobs are paused (offline or daily limit). Informational: the jobs resume by themselves. */
export default function JobPauseBanner({ onUpgrade }) {
  const [state, setState] = React.useState(getPauseState());
  React.useEffect(() => subscribePause(setState), []);
  if (!state.active) return null;
  const offline = state.kind === 'offline';
  const reset = state.resetsAt && Number.isFinite(state.resetsAt) ? new Date(state.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="job-pause-banner" role="status" aria-live="polite">
      <span>
        {offline
          ? `You are offline. ${state.count > 1 ? `${state.count} jobs are` : 'Your job is'} paused and will resume automatically when the connection returns.`
          : `Daily limit reached. ${state.count > 1 ? `${state.count} jobs are` : 'Your job is'} paused and will resume${reset ? ` at ${reset}` : ' when the limit resets'}, or right away if you upgrade.`}
      </span>
      {!offline && onUpgrade && <button type="button" onClick={onUpgrade}>Upgrade</button>}
    </div>
  );
}
