import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui/Icon';
import { OfflineBanner } from './ui/OfflineBanner';
import { Storage } from './pages/Storage';
import { Providers } from './pages/Providers';
import { Legal } from './pages/Legal';
import { Support } from './pages/Support';
import { Settings } from './pages/Settings';
import { AppearancePage } from './pages/Appearance';
import { SiteTools } from './pages/SiteTools';
import { Codelab } from './pages/Codelab';
import { Billing } from './pages/Billing';
import { ForgeBuild } from './pages/ForgeBuild';
import { Doctor } from './pages/Doctor';
import { Home } from './pages/Home';
import { VercelDoctor } from './pages/VercelDoctor';
import { Welcome } from './pages/Welcome';
import { getStorageInfo } from './storage/quota';
import { useMe, signInWithGoogle, signOut } from './auth/session';
import { applyUpdate, UPDATE_READY } from './version';

type IconName = Parameters<typeof Icon>[0]['name'];
interface Route { path: string; label: string; icon?: IconName; el: ReactNode; }

const primary: Route[] = [
  { path: '/', label: 'Repositories', icon: 'home', el: <Doctor /> },
  { path: '/assistant', label: 'Ask Pothub', icon: 'code', el: <Home /> },
  { path: '/vercel', label: 'Vercel', icon: 'globe', el: <VercelDoctor /> },
  { path: '/providers', label: 'AI Providers', icon: 'key', el: <Providers /> },
  { path: '/codelab', label: 'Codelab', icon: 'code', el: <div /> },
  { path: '/billing', label: 'Billing', icon: 'star', el: <Billing /> },
  { path: '/settings', label: 'Settings', el: <Settings /> },
];
const secondary: Route[] = [
  { path: '/sites', label: 'Configured websites', icon: 'link', el: <SiteTools /> },
  { path: '/forge', label: 'App Builder', icon: 'download', el: <ForgeBuild /> },
  { path: '/appearance', label: 'App appearance', el: <AppearancePage /> },
  { path: '/legal', label: 'Legal documents', el: <Legal /> },
  { path: '/privacy', label: 'Privacy information', el: <Legal id="privacy" /> },
  { path: '/terms', label: 'Terms of service', el: <Legal id="terms" /> },
  { path: '/support', label: 'Support', el: <Support /> },
  { path: '/about', label: 'About', el: <section className="page"><h1>About</h1><div className="panel"><p>Pothub, version {__APP_VERSION__}. A GitHub-first Software Doctor for diagnosing build failures and deployment problems.</p></div></section> },
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
  const [showWelcome, setShowWelcome] = useState(() => { try { return localStorage.getItem('pothub.welcome.seen') !== '1'; } catch { return false; } });
  const [more, setMore] = useState(() => localStorage.getItem('ui.more') === '1');
  const [low, setLow] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pull, setPull] = useState(0);
  const [update, setUpdate] = useState('');
  const [guestSignInBusy, setGuestSignInBusy] = useState(false);
  const [guestSignInError, setGuestSignInError] = useState('');
  const [signOutBusy, setSignOutBusy] = useState(false);
  const touch = useRef<{ y: number; on: boolean } | null>(null);
  const routePath = path.split('?')[0].startsWith('/sites/') ? '/sites' : path.split('?')[0]; // the old backlink, diagnosis and crawl pages now live inside Configured websites
  const requestedRoute: Route = all.find((r) => r.path === routePath) ?? (path.startsWith('/legal/') ? { path: '/legal', label: 'Legal documents', el: <Legal id={path.slice(7)} /> } : primary[0]);
  const guestAccessible = new Set(['/', '/assistant', '/providers', '/legal', '/privacy', '/terms', '/support', '/about']);
  const route: Route = !me && !guestAccessible.has(requestedRoute.path) ? primary[0] : requestedRoute;

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { if (me && showWelcome) { setShowWelcome(false); try { localStorage.setItem('pothub.welcome.seen','1'); } catch { /* no-op */ } } }, [me,showWelcome]);
  useEffect(() => { const f = (e: Event) => setUpdate((e as CustomEvent<{ id: string }>).detail?.id ?? 'new'); window.addEventListener(UPDATE_READY, f); return () => window.removeEventListener(UPDATE_READY, f); }, []);
  useEffect(() => { document.title = `${route.label} · Pothub`; }, [route]);
  useEffect(() => { getStorageInfo().then((i) => setLow(i.supported && i.quota > 0 && i.usage / i.quota > 0.85)).catch(() => {}); }, [path]);
  useEffect(() => { if (!drawer) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [drawer]);

  // Render a public, crawlable guest workspace while Firebase restores the session. Protected navigation is hidden for guests.
  const link = (r: Route) => (
    <a key={r.path} href={`#${r.path}`} className={`nav-link${r.path === route.path ? ' current' : ''}`} aria-current={r.path === route.path ? 'page' : undefined}>
      {r.icon ? <Icon name={r.icon} /> : <span className="nav-gap" />}{r.label}
    </a>
  );

  if (showWelcome && !me) return <Welcome onExplore={() => { setShowWelcome(false); location.hash = '/'; }} />;

  return (
    <div className={'shell'}>
      <header className="topbar">
        <button className="icon-btn" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" size={20} /></button>
        <span className="brand">Pothub</span>
        {!me ? <><button className="guest-signin" disabled={guestSignInBusy} onClick={async () => { setGuestSignInBusy(true); setGuestSignInError(''); try { const r = await signInWithGoogle(); if (!r.ok && r.message) setGuestSignInError(r.message); } catch(e) { setGuestSignInError(e instanceof Error?e.message:'Sign-in could not be started.'); } finally { setGuestSignInBusy(false); } }}>{guestSignInBusy ? 'Signing in…' : 'Sign in'}</button>{guestSignInError&&<span className="header-auth-error" role="alert">{guestSignInError}</span>}</> : <details className="header-tools"><summary>Tools <Icon name="chevron" size={14}/></summary><div className="header-tools-pop"><a href="#/vercel">Vercel deployments</a><a href="#/codelab">Codelab</a><a href="#/providers">AI Providers</a><a href="#/billing">Billing</a><a href="#/settings">Settings</a></div></details>}
      </header>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
      <nav className={`sidebar${drawer ? ' open' : ''}`} aria-label="Main">
        <div className="brand desk">Pothub</div>
        <div className="nav-group">{(me ? primary : primary.filter((r) => r.path === '/' || r.path === '/providers')).map(link)}</div>
        {me && <div className="nav-group bottom">
          <button className="nav-link more-toggle" aria-expanded={more} aria-controls="more-nav" onClick={() => setMore((m) => { localStorage.setItem('ui.more', m ? '0' : '1'); return !m; })}>
            <span className={`chev${more ? ' up' : ''}`}><Icon name="chevron" size={16} /></span>More
          </button>
          {more && <div id="more-nav">{secondary.map(link)}<button type="button" className="nav-link signout-link" disabled={signOutBusy} onClick={async () => { setSignOutBusy(true); try { await signOut(); setDrawer(false); } finally { setSignOutBusy(false); } }}>{signOutBusy ? 'Signing out…' : 'Sign out'}</button></div>}
        </div>}
      </nav>
      <main className="main" id="main"
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

