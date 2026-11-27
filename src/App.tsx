import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui/Icon';
import { ChatHistory } from './ui/ChatHistory';
import { OfflineBanner } from './ui/OfflineBanner';
import { Home } from './pages/Home';
import { Storage } from './pages/Storage';
import { Providers } from './pages/Providers';
import { Legal } from './pages/Legal';
import { Support } from './pages/Support';
import { Settings } from './pages/Settings';
import { SiteTools } from './pages/SiteTools';
import { Codelab } from './pages/Codelab';
import { Deployments } from './pages/Deployments';
import { Billing } from './pages/Billing';
import { ForgeBuild } from './pages/ForgeBuild';
import { getStorageInfo } from './storage/quota';
import { useMe, signInWithGoogle, signOut } from './auth/session';
import { applyUpdate, UPDATE_READY } from './version';

type IconName = Parameters<typeof Icon>[0]['name'];
interface Route { path: string; label: string; icon?: IconName; el: ReactNode; }

const primary: Route[] = [
  { path: '/', label: 'Home', icon: 'home', el: <Home /> },
  { path: '/providers', label: 'AI Providers', icon: 'key', el: <Providers /> },
  { path: '/sites', label: 'Configured websites', icon: 'link', el: <SiteTools /> },
  { path: '/codelab', label: 'Codelab', icon: 'code', el: <div /> },
  { path: '/deployments', label: 'Deployments', icon: 'play', el: <Deployments /> },
  { path: '/billing', label: 'Premium', icon: 'star', el: <Billing /> },
  { path: '/forge', label: 'App Builder', icon: 'download', el: <ForgeBuild /> },
];
const secondary: Route[] = [
  { path: '/settings', label: 'Settings', el: <Settings /> },
  { path: '/legal', label: 'Legal documents', el: <Legal /> },
  { path: '/privacy', label: 'Privacy information', el: <Legal id="privacy" /> },
  { path: '/terms', label: 'Terms of service', el: <Legal id="terms" /> },
  { path: '/support', label: 'Support', el: <Support /> },
  { path: '/about', label: 'About', el: <section className="page"><h1>About</h1><div className="panel"><p>MonyGist, version {__APP_VERSION__}. A text-first AI workspace for chat, writing, research and development.</p></div></section> },
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
  const [guestSignInBusy, setGuestSignInBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const touch = useRef<{ y: number; on: boolean } | null>(null);
  const routePath = path.split('?')[0].startsWith('/sites/') ? '/sites' : path.split('?')[0]; // the old backlink, diagnosis and crawl pages now live inside Configured websites
  const requestedRoute: Route = all.find((r) => r.path === routePath) ?? (path.startsWith('/legal/') ? { path: '/legal', label: 'Legal documents', el: <Legal id={path.slice(7)} /> } : primary[0]);
  const guestAccessible = new Set(['/', '/providers', '/legal', '/privacy', '/terms', '/support', '/about']);
  const route: Route = !me && !guestAccessible.has(requestedRoute.path) ? primary[0] : requestedRoute;

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { const f = (e: Event) => setUpdate((e as CustomEvent<{ id: string }>).detail?.id ?? 'new'); window.addEventListener(UPDATE_READY, f); return () => window.removeEventListener(UPDATE_READY, f); }, []);
  useEffect(() => { document.title = `${route.label} · MonyGist`; }, [route]);
  useEffect(() => { getStorageInfo().then((i) => setLow(i.supported && i.quota > 0 && i.usage / i.quota > 0.85)).catch(() => {}); }, [path]);
  useEffect(() => { if (!drawer) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [drawer]);

  // Render a public, crawlable guest workspace while Firebase restores the session. Protected navigation is hidden for guests.
  const link = (r: Route) => (
    <a key={r.path} href={`#${r.path}`} className={`nav-link${r.path === route.path ? ' current' : ''}`} aria-current={r.path === route.path ? 'page' : undefined}>
      {r.icon ? <Icon name={r.icon} /> : <span className="nav-gap" />}{r.label}
    </a>
  );

  return (
    <div className={'shell'}>
      <header className="topbar">
        <button className="icon-btn" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" size={20} /></button>
        <span className="brand">MonyGist</span>
        {!me ? <button className="guest-signin" disabled={guestSignInBusy} onClick={async () => { setGuestSignInBusy(true); const r = await signInWithGoogle(); if (!r.ok && r.message) alert(`Sign-in failed\n\n${r.message}\n\nCheck your connection, Google sign-in configuration, and whether this app/browser is allowed to open the sign-in window.`); setGuestSignInBusy(false); }}>{guestSignInBusy ? 'Signing in…' : 'Sign in'}</button> : <details className="header-tools"><summary>Tools <Icon name="chevron" size={14}/></summary><div className="header-tools-pop"><a href="#/sites">Configured websites</a><a href="#/codelab">Codelab</a><a href="#/billing">Premium & billing</a></div></details>}
      </header>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
      <nav className={`sidebar${drawer ? ' open' : ''}`} aria-label="Main">
        <div className="brand desk">MonyGist</div>
        <div className="nav-group">{(me ? primary : primary.filter((r) => r.path === '/' || r.path === '/providers')).map(link)}</div>
        <ChatHistory onPick={() => setDrawer(false)} />
        {me && <div className="nav-group bottom">
          <button className="nav-link more-toggle" aria-expanded={more} aria-controls="more-nav" onClick={() => setMore((m) => { localStorage.setItem('ui.more', m ? '0' : '1'); return !m; })}>
            <span className={`chev${more ? ' up' : ''}`}><Icon name="chevron" size={16} /></span>More
          </button>
          {more && <div id="more-nav">{secondary.map(link)}<button type="button" className="nav-link signout-link" disabled={signOutBusy} onClick={async () => { setSignOutBusy(true); try { await signOut(); setDrawer(false); } finally { setSignOutBusy(false); } }}>{signOutBusy ? 'Signing out…' : 'Sign out'}</button></div>}
        </div>}
      </nav>
      <main className={`main${route.path === '/' ? ` chat-mode${!me ? ' guest-mode' : ''}` : ''}`} id="main"
        onTouchStart={(e) => { touch.current = { y: e.touches[0].clientY, on: e.currentTarget.scrollTop === 0 && route.path !== '/' }; }}
        onTouchMove={(e) => { const t = touch.current; if (t?.on) setPull(Math.max(0, Math.min(100, e.touches[0].clientY - t.y))); }}
        onTouchEnd={() => { if (pull >= 80) setRefresh((n) => n + 1); setPull(0); touch.current = null; }}>
        {pull > 10 && <div className="ptr" style={{ height: pull / 2 }}>{pull >= 80 ? 'Release to refresh' : 'Pull to refresh'}</div>}
        <OfflineBanner />
        {update && <div className="notice" role="status">A new version of MonyGist is ready. <button className="btn" onClick={() => void applyUpdate(update)}>Update now</button></div>}
        {low && <div className="notice warn" role="alert">Device storage is almost full. <a href="#/storage">Review storage</a> and export projects you want to keep.</div>}
        <div key={`${route.path}:${refresh}`} className="route">{route.path === '/codelab' ? null : route.el}{!me && route.path === '/' && <PublicExplore onSignIn={() => { void signInWithGoogle(); }} />}</div>
        <div className={`codelab-session${route.path === '/codelab' ? ' visible' : ''}`} aria-hidden={route.path !== '/codelab'}><Codelab /></div>
      </main>
    </div>
  );
}

function PublicExplore({ onSignIn }: { onSignIn: () => void }) {
  return <section className="public-explore" aria-label="Explore MonyGist features">
    <div className="public-explore-head"><p className="eyebrow">EXPLORE MONYGIST</p><h2>One workspace for research, code, files and websites.</h2><p>Start a new chat without an account. Sign in to unlock saved chats, site tools, publisher features, and protected workspace features.</p></div>
    <div className="public-feature-grid">
      <article><h3>AI chat & writing</h3><p>Ask questions, draft, explain, plan and refine work using your configured AI providers.</p></article>
      <article><h3>Deep research & sources</h3><p>Research current topics with relevant web results, structured explanations and consolidated citations.</p></article>
      <article><h3>Code & development</h3><p>Debug projects, understand code, plan edits and work through implementation steps.</p></article>
      <article><h3>File analysis</h3><p>Read supported documents and project files locally. Free accounts get 20 file analyses every five hours; Premium has unlimited analyses.</p></article>
      <article><h3>Website diagnosis</h3><p>Inspect site issues, review actionable recommendations and manage configured websites.</p></article>
      <article><h3>Publisher crawling & citations</h3><p>Opt in to content discovery so relevant articles can be surfaced and linked as research sources.</p></article>
      <article><h3>Developer workspace</h3><p>GitHub repository workspace, file tools and project-oriented workflows across mobile and desktop layouts.</p></article>
      <article><h3>Native app conveniences</h3><p>Android file picker and share flows, refresh gestures, offline awareness, device-safe storage and notification support where enabled.</p></article>
    </div><div className="public-explore-footer"><span>Available on web and Android · Mobile-first, desktop-ready</span><button className="btn" onClick={onSignIn}>Sign in to unlock features</button></div>
  </section>;
}
