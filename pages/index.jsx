import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { readStoredIcon, applyAppIcon } from '../src/lib/app-icon';
import { Capacitor } from '@capacitor/core';

// The existing app is deliberately client-rendered: Firebase Auth, Capacitor,
// IndexedDB and browser storage must not be initialized during Next.js SSR.
// A failed or stalled app-chunk request must never leave the user on an
// endless loading screen. Keep the client-only boundary, but fail visibly
// after a generous mobile-network timeout and provide a safe retry.
const loadPothubApp = () => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(
      'Pothub could not finish loading its app files. Check your connection and reload.'
    )), 45000);
  });
  return Promise.race([import('../src/ui/App.jsx'), timeout])
    .finally(() => clearTimeout(timeoutId));
};

function AppLoading({ error }) {
  if (error) {
    return <main className="app-crash-screen" role="alert">
      <div className="app-crash-card">
        <h1>Pothub could not load</h1>
        <p>Your saved workspace data has not been cleared. The app bundle failed to load.</p>
        <details open><summary>What happened</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{String(error?.message || error)}</pre></details>
        <button type="button" onClick={() => window.location.reload()}>Retry loading Pothub</button>
      </div>
    </main>;
  }
  return <main className="app-crash-screen" aria-live="polite">
    <div className="app-crash-card"><h1>Loading Pothub…</h1><p>Preparing your workspace securely.</p><p role="status">This can take a little longer on a slow connection.</p></div>
  </main>;
}

const App = dynamic(loadPothubApp, {
  ssr: false,
  loading: AppLoading,
});

export default function HomePage() {
  // Apply the saved pot icon + accent color immediately, before the app bundle and IndexedDB are ready.
  useEffect(() => { applyAppIcon(readStoredIcon(), document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'); }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update().catch(() => {}))
      .catch(error => console.warn('Pothub offline support unavailable', error));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    // Re-check on return from background/sleep so installed PWAs discover
    // deployments promptly instead of continuing with a stale controller.
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration('/').then(reg => reg?.update()).catch(() => {});
      }
    };
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);
    return () => {
      window.removeEventListener('load', register);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);
  return <><Head><title>Pothub</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="theme-color" content="#0d1117" /><link rel="manifest" href="/manifest.webmanifest" /></Head><App /></>;
}
