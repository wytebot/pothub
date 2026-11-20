import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui/Icon';
import { ChatHistory } from './ui/ChatHistory';
import { OfflineBanner } from './ui/OfflineBanner';
import { Home } from './pages/Home';
import { Storage } from './pages/Storage';
import { Welcome } from './pages/Welcome';
import { Providers } from './pages/Providers';
import { Legal } from './pages/Legal';
import { Support } from './pages/Support';
import { Settings } from './pages/Settings';
import { AppearancePage } from './pages/Appearance';
import { SiteTools } from './pages/SiteTools';
import { Codelab } from './pages/Codelab';
import { Billing } from './pages/Billing';
import { getStorageInfo } from './storage/quota';
import { useMe } from './auth/session';
import { applyUpdate, UPDATE_READY } from './version';

type IconName = Parameters<typeof Icon>[0]['name'];
interface Route { path: string; label: string; icon?: IconName; el: ReactNode; }

const primary: Route[] = [
  { path: '/', label: 'Home', icon: 'home', el: <Home /> },
  { path: '/providers', label: 'AI Providers', icon: 'key', el: <Providers /> },
  { path: '/sites', label: 'Configured websites', icon: 'link', el: <SiteTools mode="sites" /> },
  { path: '/sites/backlinks', label: 'Backlink snippets', icon: 'link', el: <SiteTools mode="backlinks" /> },
  { path: '/sites/diagnosis', label: 'Website diagnosis', icon: 'globe', el: <SiteTools mode="diagnosis" /> },
  { path: '/sites/diagnosis/results', label: 'Diagnosis results', icon: 'file', el: <SiteTools mode="results" /> },
  { path: '/codelab', label: 'Codelab', icon: 'code', el: <div /> },
  { path: '/billing', label: 'Premium', icon: 'star', el: <Billing /> },
];
const secondary: Route[] = [
  { path: '/settings', label: 'Settings', el: <Settings /> },
  { path: '/appearance', label: 'App appearance', el: <AppearancePage /> },
  { path: '/legal', label: 'Legal documents', el: <Legal /> },
  { path: '/privacy', label: 'Privacy information', el: <Legal id="privacy" /> },
  { path: '/terms', label: 'Terms of service', el: <Legal id="terms" /> },
  { path: '/support', label: 'Support', el: <Support /> },
  { path: '/about', label: 'About', el: <section className="page"><h1>About</h1><div className="panel"><p>Pothub, version {__APP_VERSION__}. A text-first AI workspace for chat, writing, research and development.</p></div></section> },
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
  const route: Route = all.find((r) => r.path === path.split('?')[0]) ?? (path.startsWith('/legal/') ? { path: '/legal', label: 'Legal documents', el: <Legal id={path.slice(7)} /> } : primary[0]);

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { const f = (e: Event) => setUpdate((e as CustomEvent<{ id: string }>).detail?.id ?? 'new'); window.addEventListener(UPDATE_READY, f); return () => window.removeEventListener(UPDATE_READY, f); }, []);
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
    <div className={'shell'}>
      <header className="topbar">
        <button className="icon-btn" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" size={20} /></button>
        <span className="brand">Pothub</span>
        <details className="header-tools"><summary>Tools <Icon name="chevron" size={14}/></summary><div className="header-tools-pop"><a href="#/sites">Configured websites</a><a href="#/sites/backlinks">Backlink snippets</a><a href="#/sites/diagnosis">Website diagnosis</a><a href="#/sites/diagnosis/results">Latest diagnosis</a><a href="#/codelab">Codelab</a><a href="#/billing">Premium & billing</a></div></details>
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
      <main className={`main${route.path === '/' ? ' chat-mode' : ''}`} id="main"
        onTouchStart={(e) => { touch.current = { y: e.touches[0].clientY, on: e.currentTarget.scrollTop === 0 && route.path !== '/' }; }}
        onTouchMove={(e) => { const t = touch.current; if (t?.on) setPull(Math.max(0, Math.min(100, e.touches[0].clientY - t.y))); }}
        onTouchEnd={() => { if (pull >= 80) setRefresh((n) => n + 1); setPull(0); touch.current = null; }}>
        {pull > 10 && <div className="ptr" style={{ height: pull / 2 }}>{pull >= 80 ? 'Release to refresh' : 'Pull to refresh'}</div>}
        <OfflineBanner />
        {update && <div className="notice" role="status">A new version of Pothub is ready. <button className="btn" onClick={() => void applyUpdate(update)}>Update now</button></div>}
        {low && <div className="notice warn" role="alert">Device storage is almost full. <a href="#/storage">Review storage</a> and export projects you want to keep.</div>}
        <div key={`${route.path}:${refresh}`} className="route">{route.path === '/codelab' ? null : route.el}</div>
        <div className={`codelab-session${route.path === '/codelab' ? ' visible' : ''}`} aria-hidden={route.path !== '/codelab'}><Codelab /></div>
      </main>
    </div>
  );
}
