import React from 'react';
import { ALL_TARGETS, firstProblem, markSaved, needsVercelReauth, newRow, pendingRows, startRows, toPayload, toggleTarget } from '../../lib/vercel-env.js';

/** Draft of environment variables being typed: pending rows, rows already saved (shown grey), and the save call. */
export default function useEnvDraft(api) {
  const [rows, setRows] = React.useState(startRows);
  const [targets, setTargets] = React.useState(ALL_TARGETS);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);
  const apiRef = React.useRef(api); apiRef.current = api;
  const rowsRef = React.useRef(rows); rowsRef.current = rows;
  const targetsRef = React.useRef(targets); targetsRef.current = targets;

  const update = React.useCallback((id, patch) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))), []);
  const add = React.useCallback(() => setRows((r) => [...r, newRow()]), []);
  const remove = React.useCallback((id) => setRows((r) => { const n = r.filter((x) => x.id !== id); return n.some((x) => !x.saved) ? n : [...n, newRow()]; }), []);
  const toggle = React.useCallback((t) => setTargets((old) => toggleTarget(old, t)), []);
  const reset = React.useCallback(() => { setRows(startRows()); setError(''); setReauth(false); setAttempted(false); }, []);

  /** Saves every filled, unsaved row. Resolves { ok, saved } and never throws. */
  const save = React.useCallback(async () => {
    setAttempted(true); setError(''); setReauth(false);
    const current = rowsRef.current;
    const problem = firstProblem(current);
    if (problem) { setError(problem); return { ok: false, saved: [] }; }
    const variables = toPayload(current);
    if (!variables.length) return { ok: true, saved: [] };
    if (!targetsRef.current.length) { setError('Choose at least one environment.'); return { ok: false, saved: [] }; }
    setBusy(true);
    try {
      const d = await apiRef.current('/api/vercel/environment-variables', { method: 'POST', body: JSON.stringify({ variables, targets: targetsRef.current }) });
      const keys = d?.savedKeys || variables.map((v) => v.key);
      setRows((r) => markSaved(r, keys)); setAttempted(false);
      return { ok: true, saved: keys };
    } catch (e) {
      setError(String(e?.message || e || 'Could not save the variables.'));
      setReauth(needsVercelReauth(e));
      return { ok: false, saved: [], reauth: needsVercelReauth(e) };
    } finally { setBusy(false); }
  }, []);

  return { rows, targets, busy, error, reauth, attempted, update, add, remove, toggle, reset, save, pending: pendingRows(rows).length, saved: rows.filter((r) => r.saved) };
}
