// Real progress for repository chats: every step is something that actually happened (the outline was loaded, files were
// copied, a command ran) or a section heading the model itself wrote. Nothing is invented to fill time.
export const PHASE_LABEL = {
  understanding: 'Understanding the request',
  investigation: 'Investigating the code',
  problem: 'Identifying the problem',
  plan: 'Planning the fix',
  fix: 'Implementing the fix',
};
const WORD_TO_PHASE = { understanding: 'understanding', investigation: 'investigation', analysis: 'investigation', problem: 'problem', 'root cause': 'problem', plan: 'plan', solution: 'plan', fix: 'fix', implementation: 'fix' };

/** Phases the model has started so far, in order. Only short heading lines (## Plan, **Fix**) count, never ordinary sentences. */
export function detectPhases(text) {
  const found = [];
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(?:#{1,4}\s+|\*\*)\s*(understanding|investigation|analysis|root cause|problem|plan|solution|fix|implementation)\b[^\n]{0,40}$/i.exec(line);
    const phase = m && WORD_TO_PHASE[m[1].toLowerCase()];
    if (phase && !found.includes(phase)) found.push(phase);
  }
  return found;
}

/** Mark the current step done and start a new one (no-op when it is already the active step). */
export function pushStep(steps, label) {
  const list = Array.isArray(steps) ? steps : [];
  const last = list[list.length - 1];
  if (last && last.label === label && last.status === 'active') return list;
  const done = list.map((s) => (s.status === 'active' ? { ...s, status: 'done' } : s));
  return [...done, { id: `${done.length}:${label}`.slice(0, 90), label, status: 'active' }].slice(-12);
}

export const finishSteps = (steps, status = 'done') => (Array.isArray(steps) ? steps : []).map((s) => (s.status === 'active' ? { ...s, status } : s));

export function shortCommand(command, max = 70) {
  const one = String(command || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
