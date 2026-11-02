import React from 'react';
import '../src/ui/styles.css';
import DeploymentUpdateNotice from '../src/ui/DeploymentUpdateNotice.jsx';

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false, message: '', stack: '' }; }
  static getDerivedStateFromError(error) { return { failed: true, message: String(error?.message || error || 'Unknown rendering error'), stack: String(error?.stack || '') }; }
  componentDidCatch(error, info) { console.error('Pothub UI crashed:', error, info?.componentStack || ''); }
  render() {
    if (this.state.failed) return <main className="app-crash-screen" role="alert"><div className="app-crash-card"><h1>Pothub ran into a problem</h1><p>Your local project history has not been intentionally deleted. The error details below can help identify the cause.</p><details open><summary>Error details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12,maxHeight:'42vh',overflow:'auto'}}>{this.state.message}{this.state.stack ? `\n\n${this.state.stack}` : ''}</pre></details><button type="button" onClick={() => window.location.reload()}>Reload Pothub</button><button type="button" onClick={() => { try { const report = `Pothub crash\nURL: ${location.href}\nError: ${this.state.message}\n${this.state.stack}`; navigator.clipboard?.writeText(report); } catch {} }}>Copy error details</button></div></main>;
    return <>{this.props.children}<DeploymentUpdateNotice /></>;
  }
}
export default function PothubApp({ Component, pageProps }) {
  return <AppErrorBoundary><Component {...pageProps} /></AppErrorBoundary>;
}
