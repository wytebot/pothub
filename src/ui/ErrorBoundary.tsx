import React from 'react';

interface Props { children: React.ReactNode; }
interface State { failed: boolean; error?: Error; }
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(error: unknown): State { return { failed: true, error: error instanceof Error ? error : new Error(String(error)) }; }
  componentDidCatch(error: Error, info: React.ErrorInfo): void { console.error('MonyGist render error', error, info); }
  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main style={{ padding: 24, maxWidth: 560, margin: '10vh auto', textAlign: 'center' }}><h2>Something went wrong</h2><p>The app hit an unexpected error. Your saved chats should remain available.</p><button onClick={() => location.reload()}>Reload</button> <button onClick={() => { location.hash = '#/'; location.reload(); }}>Go home</button></main>;
  }
}
