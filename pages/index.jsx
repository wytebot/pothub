import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

// The existing app is deliberately client-rendered: Firebase Auth, Capacitor,
// IndexedDB and browser storage must not be initialized during Next.js SSR.
const App = dynamic(() => import('../src/ui/App.jsx'), {
  ssr: false,
  loading: () => <main className="app-crash-screen" aria-live="polite"><div className="app-crash-card"><h1>Loading Pothub…</h1><p>Preparing your workspace securely.</p></div></main>,
});

export default function HomePage() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update().catch(() => {}))
      .catch(error => console.warn('Pothub offline support unavailable', error));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return <><Head><title>Pothub</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="theme-color" content="#0d1117" /><link rel="manifest" href="/manifest.webmanifest" /></Head><App /></>;
}
