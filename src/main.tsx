import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { platform } from './platform';
import { startAnalytics } from './firebase';
import { watchForNewVersion } from './version';
import { startNotifications } from './notify';
import './styles.css';
import { applyAppearance, getAppearance } from './appearance';
import { purgeLegacyMediaKeys } from './vault/vault';
import { pruneExpiredArtifacts } from './storage/db';

platform.init();
applyAppearance(getAppearance());
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.warn('PWA service worker registration failed', error));
  });
}
startAnalytics();
watchForNewVersion();
startNotifications();
void purgeLegacyMediaKeys().catch(() => {});
void pruneExpiredArtifacts().catch(() => {});
const reportGlobalError = (message: string, detail?: unknown) => {
  console.error(`[MonyGist runtime] ${message}`, detail);
  try { const entries = JSON.parse(localStorage.getItem('monygist.runtime.errors') || '[]') as Array<{ at: number; message: string }>;
    entries.push({ at: Date.now(), message }); localStorage.setItem('monygist.runtime.errors', JSON.stringify(entries.slice(-30))); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent('monygist:runtime-error', { detail: { message } }));
};
window.addEventListener('error', (event: ErrorEvent) => reportGlobalError(event.message || 'Unexpected browser error', event.error));
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => reportGlobalError('Unhandled promise rejection', event.reason));
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
