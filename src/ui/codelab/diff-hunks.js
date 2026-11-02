/** A bounded, deterministic line diff for human-reviewed edits. */
export function diffHunks(originalText, proposedText, context = 3) {
  const a = String(originalText ?? '').split('\n');
  const b = String(proposedText ?? '').split('\n');
  if (a.join('\n') === b.join('\n')) return [];
  // Avoid quadratic memory use on huge files; present a single explicit replacement instead.
  if (a.length * b.length > 1_000_000) return [{ id: 'hunk-0', start: 0, end: a.length, before: a, after: b, oversized: true }];
  const rows = a.length + 1, cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint32Array(cols));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push({ type: 'equal', a: a[i], b: b[j], ai: i }); i++; j++; }
    else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) { ops.push({ type: 'insert', b: b[j] }); j++; }
    else { ops.push({ type: 'delete', a: a[i], ai: i }); i++; }
  }
  const changed = []; for (let k = 0; k < ops.length; k++) if (ops[k].type !== 'equal') changed.push(k);
  const groups = [];
  for (const k of changed) { const start = Math.max(0, k - context), end = Math.min(ops.length, k + context + 1), last = groups[groups.length - 1]; if (last && start <= last.end) last.end = end; else groups.push({ start, end }); }
  return groups.map((g, idx) => {
    const slice = ops.slice(g.start, g.end); const before = slice.filter(o => o.type !== 'insert').map(o => o.a); const after = slice.filter(o => o.type !== 'delete').map(o => o.b);
    const start = slice.find(o => o.type !== 'insert')?.ai ?? a.length;
    return { id: `hunk-${idx}`, start, end: start + before.length, before, after, lines: slice.map(o => ({ type: o.type, text: o.type === 'insert' ? o.b : o.a })) };
  });
}
export function applySelectedHunks(originalText, hunks, acceptedIds) {
  const original = String(originalText ?? '').split('\n');
  const selected = hunks.filter(h => acceptedIds.has(h.id)).sort((x, y) => y.start - x.start);
  for (const h of selected) {
    const current = original.slice(h.start, h.end);
    if (current.length !== h.before.length || current.some((line, i) => line !== h.before[i])) throw new Error('The source changed while reviewing this diff. Reopen the review before applying.');
    original.splice(h.start, h.before.length, ...h.after);
  }
  return original.join('\n');
}
