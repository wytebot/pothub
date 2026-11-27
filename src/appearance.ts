export type PotShape = 'classic' | 'round' | 'tall' | 'wide' | 'fluted' | 'handle';
export interface Appearance { pot: PotShape; color: string; }
export const APPEARANCE_KEY = 'pothub.appearance';
export const COLORS = [
  { name: 'Porcelain', value: '#f3f3f3' }, { name: 'Mint', value: '#70d6b3' },
  { name: 'Sky', value: '#75baff' }, { name: 'Violet', value: '#b69cff' },
  { name: 'Coral', value: '#ff927e' }, { name: 'Amber', value: '#f3c66b' },
  { name: 'Rose', value: '#f18bb5' }, { name: 'Lime', value: '#b5d879' },
];
const shapes: Record<PotShape, { move: string; art: string }> = {
  classic: { move: 'translate(0 3)', art: '<rect x="29.5" y="9" width="5" height="4" rx="2"/><path d="M17 21a15 8 0 0 1 30 0z"/><rect x="13" y="23" width="38" height="5" rx="2.5"/><path d="M16 28h32v16a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z"/><rect x="8" y="31" width="8" height="4" rx="2"/><rect x="48" y="31" width="8" height="4" rx="2"/>' },
  round: { move: 'translate(0 2)', art: '<rect x="29" y="11" width="6" height="4" rx="2"/><path d="M16 24a16 9 0 0 1 32 0z"/><rect x="14" y="26" width="36" height="4" rx="2"/><path d="M15 30h34v6a17 14 0 0 1-34 0z"/><rect x="9" y="32" width="6" height="4" rx="2"/><rect x="49" y="32" width="6" height="4" rx="2"/>' },
  tall: { move: 'translate(0 2)', art: '<rect x="29.5" y="8" width="5" height="4" rx="2"/><path d="M21 18a11 6 0 0 1 22 0z"/><rect x="19" y="20" width="26" height="4" rx="2"/><path d="M21 24h22v24a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5z"/><rect x="14" y="28" width="7" height="4" rx="2"/><rect x="43" y="28" width="7" height="4" rx="2"/>' },
  wide: { move: 'translate(0 0)', art: '<rect x="29" y="16" width="6" height="4" rx="2"/><path d="M13 28a19 8 0 0 1 38 0z"/><rect x="9" y="30" width="46" height="4" rx="2"/><path d="M11 34h42v6a8 8 0 0 1-8 8H19a8 8 0 0 1-8-8z"/><rect x="4" y="35" width="7" height="4" rx="2"/><rect x="53" y="35" width="7" height="4" rx="2"/>' },
  fluted: { move: 'translate(0 3)', art: '<rect x="29.5" y="9" width="5" height="4" rx="2"/><path d="M17 21a15 8 0 0 1 30 0z"/><rect x="13" y="23" width="38" height="5" rx="2.5"/><path d="M16 28h32v16a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z"/><rect x="8" y="31" width="8" height="4" rx="2"/><rect x="48" y="31" width="8" height="4" rx="2"/><path d="M24 32v14M32 32v14M40 32v14" fill="none" stroke="{b}" stroke-width="2" stroke-linecap="round" opacity=".4"/>' },
  handle: { move: 'translate(-4 3)', art: '<rect x="26.5" y="9" width="5" height="4" rx="2"/><path d="M15 21a14 7 0 0 1 28 0z"/><rect x="12" y="23" width="34" height="5" rx="2.5"/><path d="M14 28h30v16a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z"/><rect x="46" y="31" width="14" height="5" rx="2.5"/>' },
};
export const DEFAULT_APPEARANCE: Appearance = { pot: 'classic', color: '#f3f3f3' };
export function getAppearance(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}') as Partial<Appearance>;
    return { pot: (a.pot && a.pot in shapes ? a.pot : 'classic') as PotShape,
      color: COLORS.some(c => c.value === a.color) ? a.color! : DEFAULT_APPEARANCE.color };
  } catch { return DEFAULT_APPEARANCE; }
}
export function potSvg(pot: PotShape, color: string, bg = '#0d0d0d') {
  const { move, art } = shapes[pot];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${bg}"/><g transform="${move}" fill="${color}">${art.split('{b}').join(bg)}</g></svg>`;
}
const data = (s: string) => `data:image/svg+xml,${encodeURIComponent(s)}`;
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.style.setProperty('--accent', a.color);
  root.style.setProperty('--focus', a.color);
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  theme?.setAttribute('content', '#0d0d0d');
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = '/icon.svg';
  // Refresh the install manifest metadata for browsers that re-read it before installation.
  const manifest = {
    id: '/', name: 'MonyGist', short_name: 'MonyGist', start_url: '/', scope: '/',
    display: 'standalone', background_color: '#0d0d0d', theme_color: '#0d0d0d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) {
    const old = link.dataset.dynamicUrl;
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    link.href = url; link.dataset.dynamicUrl = url;
  }
}
