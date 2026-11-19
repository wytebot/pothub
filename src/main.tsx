import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { platform } from './platform';
import { startAnalytics } from './firebase';
import { startAccountSync } from './auth/sync';
import { startCloudSync } from './cloud/sync';
import { watchForNewVersion } from './version';
import './styles.css';
import { applyAppearance, getAppearance } from './appearance';

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
startAccountSync();
startCloudSync();
watchForNewVersion();
// After a bank (3-D Secure) page, send the customer back to Billing to confirm the payment.
if (location.search && localStorage.getItem('billing.pending')) location.hash = '/billing';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
