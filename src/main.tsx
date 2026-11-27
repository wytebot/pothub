import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
