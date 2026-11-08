import React from 'react';

/** Live list of what the agent is doing in a repository chat: reading, searching, analysing, planning, implementing. */
export default function AgentSteps({ steps }) {
  if (!steps?.length) return null;
  return (
    <ol className="agent-steps" role="status" aria-live="polite" aria-label="What the agent is doing">
      {steps.slice(-8).map((s) => (
        <li key={s.id} className={`agent-step ${s.status}`}>
          <span className="agent-step-mark" aria-hidden="true">{s.status === 'done' ? '✓' : s.status === 'error' ? '✕' : <span className="work-spinner" />}</span>
          <span className="agent-step-text">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
