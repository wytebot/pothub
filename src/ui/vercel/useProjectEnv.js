import React from 'react';

/** Variable names configured on the selected project. Reloads on its own when the project changes, when the app is opened again, and every 30 seconds, so new variables appear without a manual refresh. */
export default function useProjectEnv(api, project, { every = 30000 } = {}) {
  const [vars, setVars] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [updatedAt, setUpdatedAt] = React.useState(0);
  const apiRef = React.useRef(api); apiRef.current = api;
  const projectId = project?.id || '';

  const load = React.useCallback(async (quiet = false) => {
    if (!projectId) { setVars([]); return; }
    if (!quiet) setLoading(true);
    try {
      const d = await apiRef.current('/api/vercel/environment-variables');
      setVars(d.variables || []); setError(''); setUpdatedAt(Date.now());
    } catch (e) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }, [projectId]);

  React.useEffect(() => { setVars([]); load(); }, [load]);
  React.useEffect(() => {
    if (!projectId) return undefined;
    const again = () => { if (document.visibilityState === 'visible') load(true); };
    const t = setInterval(again, every);
    document.addEventListener('visibilitychange', again); window.addEventListener('focus', again);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [projectId, load, every]);

  return { vars, loading, error, updatedAt, reload: () => load() };
}
