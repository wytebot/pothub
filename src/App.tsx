import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui/Icon';
import { ChatHistory } from './ui/ChatHistory';
import { OfflineBanner } from './ui/OfflineBanner';
import { Home } from './pages/Home';
import { Projects } from './pages/Projects';
import { Storage } from './pages/Storage';
import { Welcome } from './pages/Welcome';
import { Providers } from './pages/Providers';
import { Legal } from './pages/Legal';
import { Support } from './pages/Support';
import { VideoStudio } from './pages/VideoStudio';
import { Editor } from './pages/Editor';
import { Billing } from './pages/Billing';
import { Settings } from './pages/Settings';
import { AppearancePage } from './pages/Appearance';
import { ImageStudio } from './pages/ImageStudio';
import { SiteTools } from './pages/SiteTools';
import { getStorageInfo } from './storage/quota';
import { useMe } from './auth/session';
import { startJobPoller } from './agent/jobs';
import { applyUpdate, UPDATE_READY } from './version';

type IconName = Parameters<typeof Icon>[0]['name'];
interface Route { path: string; label: string; icon?: IconName; el: ReactNode; }

const primary: Route[] = [
  { path: '/', label: 'Home', icon: 'home', el: <Home /> },
  { path: '/image', label: 'Image Studio', icon: 'image', el: <ImageStudio /> },
  { path: '/video', label: 'Video Studio', icon: 'video', el: <VideoStudio /> },
  { path: '/editor', label: 'Creative Editor', icon: 'editor', el: <Editor /> },
  { path: '/projects', label: 'Projects', icon: 'folder', el: <Projects /> },
  { path: '/providers', label: 'AI Providers', icon: 'key', el: <Providers /> },
  { path: '/billing', label: 'Account and Billing', icon: 'card', el: <Billing /> },
  { path: '/sites', label: 'Website tools', icon: 'link', el: <SiteTools /> },
];
const secondary: Route[] = [
  { path: '/settings', label: 'Settings', el: <Settings /> },
  { path: '/appearance', label: 'App appearance', el: <AppearancePage /> },
  { path: '/legal', label: 'Legal documents', el: <Legal /> },
  { path: '/privacy', label: 'Privacy information', el: <Legal id="privacy" /> },
  { path: '/terms', label: 'Terms of service', el: <Legal id="terms" /> },
  { path: '/support', label: 'Support', el: <Support /> },
  { path: '/about', label: 'About', el: <section className="page"><h1>About</h1><div className="panel"><p>Pothub, version 0.5.8. A local-first studio for AI chat, images and video. Your media never leaves this device unless you export it or send it to the AI provider you choose.</p></div></section> },
  { path: '/storage', label: 'Storage information', el: <Storage /> },
];
const all = [...primary, ...secondary];

function useRoute() {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => { const f = () => setH(location.hash.slice(1) || '/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}

export function App() {
  const path = useRoute();
  const me = useMe();
  const [drawer, setDrawer] = useState(false);
  const [more, setMore] = useState(() => localStorage.getItem('ui.more') === '1');
  const [low, setLow] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pull, setPull] = useState(0);
  const [update, setUpdate] = useState('');
  const touch = useRef<{ y: number; on: boolean } | null>(null);
  const until = Number(localStorage.getItem('billing.entitledUntil') ?? 0) || Number(localStorage.getItem('billing.lastUntil') ?? 0);
  const route: Route = all.find((r) => r.path === path) ?? (path.startsWith('/editor/') ? { path: '/editor', label: 'Creative Editor', icon: 'editor' as IconName, el: <Editor projectId={path.slice(8)} /> } : path.startsWith('/legal/') ? { path: '/legal', label: 'Legal documents', el: <Legal id={path.slice(7)} /> } : primary[0]);

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { const f = (e: Event) => setUpdate((e as CustomEvent<{ id: string }>).detail?.id ?? 'new'); window.addEventListener(UPDATE_READY, f); return () => window.removeEventListener(UPDATE_READY, f); }, []);
  // Persisted provider-side video jobs resume polling whenever the app is active again, even after sign-out.
  useEffect(() => startJobPoller(8000), []);
  useEffect(() => { document.title = `${route.label} · Pothub`; }, [route]);
  useEffect(() => { getStorageInfo().then((i) => setLow(i.supported && i.quota > 0 && i.usage / i.quota > 0.85)).catch(() => {}); }, [path]);
  useEffect(() => { if (!drawer) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [drawer]);

  if (me === undefined) return <div className="auth-loading" role="status" aria-label="Checking sign-in"><span className="spin" /><p>Checking your sign-in…</p></div>;
  if (!me) return <Welcome />;

  const link = (r: Route) => (
    <a key={r.path} href={`#${r.path}`} className={`nav-link${r.path === route.path ? ' current' : ''}`} aria-current={r.path === route.path ? 'page' : undefined}>
      {r.icon ? <Icon name={r.icon} /> : <span className="nav-gap" />}{r.label}
    </a>
  );

  return (
    <div className={`shell${path.startsWith('/editor/') ? ' editor-open' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" size={20} /></button>
        <span className="brand">Pothub</span>
      </header>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
      <nav className={`sidebar${drawer ? ' open' : ''}`} aria-label="Main">
        <div className="brand desk">Pothub</div>
        <div className="nav-group">{primary.map(link)}</div>
        <ChatHistory onPick={() => setDrawer(false)} />
        <div className="nav-group bottom">
          <button className="nav-link more-toggle" aria-expanded={more} aria-controls="more-nav" onClick={() => setMore((m) => { localStorage.setItem('ui.more', m ? '0' : '1'); return !m; })}>
            <span className={`chev${more ? ' up' : ''}`}><Icon name="chevron" size={16} /></span>More
          </button>
          {more && <div id="more-nav">{secondary.map(link)}</div>}
        </div>
      </nav>
      <main className={`main${route.path === '/' ? ' chat-mode' : ''}${path.startsWith('/editor/') ? ' editor-mode' : ''}`} id="main"
        onTouchStart={(e) => { touch.current = { y: e.touches[0].clientY, on: e.currentTarget.scrollTop === 0 && !path.startsWith('/editor') && route.path !== '/' }; }}
        onTouchMove={(e) => { const t = touch.current; if (t?.on) setPull(Math.max(0, Math.min(100, e.touches[0].clientY - t.y))); }}
        onTouchEnd={() => { if (pull >= 80) setRefresh((n) => n + 1); setPull(0); touch.current = null; }}>
        {pull > 10 && <div className="ptr" style={{ height: pull / 2 }}>{pull >= 80 ? 'Release to refresh' : 'Pull to refresh'}</div>}
        <OfflineBanner />
        {update && <div className="notice" role="status">A new version of Pothub is ready. <button className="btn" onClick={() => void applyUpdate(update)}>Update now</button></div>}
        {until > 0 && until - Date.now() < 7 * 86_400_000 && <div className="notice warn" role="status">{until > Date.now() ? `Premium ends on ${new Date(until).toLocaleDateString()}. It does not renew automatically. ` : 'Premium has ended. '}<a href="#/billing">{until > Date.now() ? 'Add time' : 'Renew'}</a></div>}
        {low && <div className="notice warn" role="alert">Device storage is almost full. <a href="#/storage">Review storage</a> and export projects you want to keep.</div>}
        <div key={`${route.path}:${refresh}`} className="route">{route.el}</div>
      </main>
    </div>
  );
}
