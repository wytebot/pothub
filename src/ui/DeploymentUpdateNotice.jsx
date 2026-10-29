import React, { useEffect, useState } from 'react';

/** Shows only when an already-controlled page detects a newer service worker. */
export default function DeploymentUpdateNotice() {
  const [registration, setRegistration] = useState(null);
  const [available, setAvailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reg = null;
    let updateTimer = null;
    let hadController = !!navigator.serviceWorker.controller;
    let stateHandler = null;
    const inspect = () => {
      if (!reg) return;
      if (reg.waiting && hadController) { setRegistration(reg); setAvailable(true); }
    };
    const onControllerChange = () => {
      if (refreshing) window.location.reload();
    };
    const onMessage = event => {
      if (event.data?.type === 'POTHUB_SW_UPDATED' && hadController) {
        setRegistration(reg || null);
        setAvailable(true);
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.ready.then(ready => {
      reg = ready;
      inspect();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        stateHandler = () => {
          if (worker.state === 'installed' && hadController) { setRegistration(reg); setAvailable(true); }
        };
        worker.addEventListener('statechange', stateHandler);
      });
      updateTimer = window.setInterval(() => reg?.update().catch(() => {}), 5 * 60 * 1000);
      reg.update().catch(() => {});
    }).catch(() => {});
    const rememberController = () => { if (navigator.serviceWorker.controller) hadController = true; };
    navigator.serviceWorker.addEventListener('controllerchange', rememberController);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('controllerchange', rememberController);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      if (updateTimer) window.clearInterval(updateTimer);
      if (reg && stateHandler && reg.installing) reg.installing.removeEventListener('statechange', stateHandler);
    };
  }, [refreshing]);

  if (!available) return null;
  const refresh = () => {
    setRefreshing(true);
    const waiting = registration?.waiting;
    if (waiting) {
      const timeout = window.setTimeout(() => window.location.reload(), 2500);
      navigator.serviceWorker.addEventListener('controllerchange', () => { window.clearTimeout(timeout); window.location.reload(); }, { once: true });
      waiting.postMessage({ type: 'POTHUB_SKIP_WAITING' });
    } else window.location.reload();
  };
  return <div className="deployment-update-backdrop" role="presentation"><section className="deployment-update-dialog" role="dialog" aria-modal="true" aria-labelledby="deployment-update-title"><span className="deployment-update-mark" aria-hidden="true">↻</span><h2 id="deployment-update-title">Pothub has been updated</h2><p>A new deployment is ready. Refresh to load the latest fixes and features. Your locally saved project history stays on this device.</p><div className="deployment-update-actions"><button type="button" className="secondary" onClick={() => setAvailable(false)}>Later</button><button type="button" className="primary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh now'}</button></div></section></div>;
}
