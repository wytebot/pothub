import React from 'react';
import '../src/ui/styles.css';
import DeploymentUpdateNotice from '../src/ui/DeploymentUpdateNotice.jsx';

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Pothub UI crashed:', error?.message || 'Unknown rendering error'); }
  render() {
    if (this.state.failed) return <main className="app-crash-screen" role="alert"><div className="app-crash-card"><h1>Pothub ran into a problem</h1><p>Your local project history is not intentionally deleted. Reload the app to try again.</p><button type="button" onClick={() => window.location.reload()}>Reload Pothub</button></div></main>;
    return <>{this.props.children}<DeploymentUpdateNotice /></>;
  }
}
export default function PothubApp({ Component, pageProps }) {
  return <AppErrorBoundary><Component {...pageProps} /></AppErrorBoundary>;
}
