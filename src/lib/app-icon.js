import { DEFAULT_ICON, findColor, iconAssets, iconId, normalizeIcon } from './app-icon-data';

const STORAGE_KEY = 'pothub-app-icon-v1';

// localStorage mirrors the Dexie setting so the accent colour can be applied
// immediately on load, before IndexedDB has opened.
export function readStoredIcon() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeIcon(JSON.parse(raw)) : { ...DEFAULT_ICON };
  } catch { return { ...DEFAULT_ICON }; }
}
export function storeIcon(choice) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeIcon(choice))); } catch { /* private mode */ }
}

function upsertLink(rel, attrs) {
  let el = document.head.querySelector(`link[rel="${rel}"][data-pothub-icon]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('data-pothub-icon', '1');
    document.head.appendChild(el);
  }
  for (const [key, value] of Object.entries(attrs)) if (el.getAttribute(key) !== value) el.setAttribute(key, value);
}

// Recolours the whole app (CSS accent variables) and swaps the tab icon,
// Apple touch icon and web-app manifest so installs pick up the chosen pot.
export function applyAppIcon(choice, theme = 'dark') {
  if (typeof document === 'undefined') return;
  const picked = normalizeIcon(choice), color = findColor(picked.color), assets = iconAssets(picked);
  const root = document.documentElement, light = theme === 'light';
  root.style.setProperty('--accent', light ? color.lightAccent : color.accent);
  root.style.setProperty('--accent-hover', light ? color.lightHover : color.hover);
  root.dataset.potIcon = iconId(picked);
  upsertLink('icon', { type: 'image/png', sizes: '192x192', href: assets.png192 });
  upsertLink('apple-touch-icon', { sizes: '192x192', href: assets.png192 });
  const manifest = document.head.querySelector('link[rel="manifest"]');
  if (manifest && manifest.getAttribute('href') !== assets.manifest) manifest.setAttribute('href', assets.manifest);
}
