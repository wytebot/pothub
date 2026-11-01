import React, { useEffect, useState } from 'react';
import { CLIENT_BUILD, isNativeApp, isStaleBuild, fetchServerBuild, mayAutoReload, markAutoReload, hardRefresh } from '../lib/version-check';

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

  // Build-id staleness check: independent of the service worker, so it also covers installed PWAs, TWAs and
  // WebViews that keep an old bundle alive in memory or cache. Cold start/long-background resume refreshes
  // automatically (once per build); short foreground checks only show the dialog.
  useEffect(() => {
    if (typeof window === 'undefined' || !CLIENT_BUILD || isNativeApp()) return;
    let stopped = false, lastCheck = 0, hiddenAt = 0;
    const check = async mode => {
      if (stopped || (mode !== 'load' && Date.now() - lastCheck < 30000)) return;
      lastCheck = Date.now();
      const serverBuild = await fetchServerBuild();
      if (stopped || !isStaleBuild(serverBuild)) return;
      if ((mode === 'load' || mode === 'resume') && mayAutoReload(serverBuild)) { markAutoReload(serverBuild); hardRefresh(); return; }
      setAvailable(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
      check(away >= 60000 ? 'resume' : 'foreground');
    };
    check('load');
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => check('foreground'), 5 * 60 * 1000);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisibility); window.clearInterval(timer); };
  }, []);

  if (!available) return null;
  const refresh = () => {
    setRefreshing(true);
    registration?.waiting?.postMessage({ type: 'POTHUB_SKIP_WAITING' });
    hardRefresh();
  };
  return <div className="deployment-update-backdrop" role="presentation"><section className="deployment-update-dialog" role="dialog" aria-modal="true" aria-labelledby="deployment-update-title"><span className="deployment-update-mark" aria-hidden="true">↻</span><h2 id="deployment-update-title">Pothub has been updated</h2><p>A new deployment is ready. Refresh to load the latest fixes and features. Your locally saved project history stays on this device.</p><div className="deployment-update-actions"><button type="button" className="secondary" onClick={() => setAvailable(false)}>Later</button><button type="button" className="primary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh now'}</button></div></section></div>;
}
