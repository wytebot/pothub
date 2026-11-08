import React from 'react';

/** What the agent is doing right now, as one faded, softly blinking line (like Claude). Finished steps are not listed. */
export function activeLabel(steps) {
  const list = Array.isArray(steps) ? steps : [];
  return [...list].reverse().find((s) => s.status === 'active')?.label || '';
}

export function StatusLine({ label }) {
  if (!label) return null;
  return (
    <div className="status-line" role="status" aria-live="polite" aria-label="What the agent is doing">
      <span key={label} className="status-line-text">{label}</span>
    </div>
  );
}

export default function AgentSteps({ steps }) {
  return <StatusLine label={activeLabel(steps)} />;
}
