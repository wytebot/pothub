import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import './ui/styles.css';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    // Keep diagnostics local; never send user data or credentials to a remote logger.
    console.error('Pothub UI crashed:', error?.message || 'Unknown rendering error');
  }
  render() {
    if (this.state.failed) {
      return (
        <main className="app-crash-screen" role="alert">
          <div className="app-crash-card">
            <h1>Pothub ran into a problem</h1>
            <p>Your local project history is not intentionally deleted. Reload the app to try again.</p>
            <button type="button" onClick={() => window.location.reload()}>Reload Pothub</button>
            <button type="button" className="app-crash-secondary" onClick={() => { try { localStorage.removeItem('pothub_text_size'); } catch {} window.location.reload(); }}>Reset display preference & reload</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Pothub offline support unavailable', error));
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>
);
