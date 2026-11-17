export type PotShape = 'classic' | 'round' | 'tall' | 'wide' | 'fluted' | 'handle';
export interface Appearance { pot: PotShape; color: string; }
export const APPEARANCE_KEY = 'pothub.appearance';
export const COLORS = [
  { name: 'Porcelain', value: '#f3f3f3' }, { name: 'Mint', value: '#70d6b3' },
  { name: 'Sky', value: '#75baff' }, { name: 'Violet', value: '#b69cff' },
  { name: 'Coral', value: '#ff927e' }, { name: 'Amber', value: '#f3c66b' },
  { name: 'Rose', value: '#f18bb5' }, { name: 'Lime', value: '#b5d879' },
];
const shapes: Record<PotShape, string> = {
  classic: '<path d="M7 9h10l-1.1 10H8.1L7 9Z"/><path d="M6 6h12v3H6z"/><path d="M9 6V4h6v2"/>',
  round: '<path d="M6 9h12l-1.5 10h-9L6 9Z"/><path d="M5 6h14v3H5z"/>',
  tall: '<path d="M8 8h8l-1 11H9L8 8Z"/><path d="M7 5h10v3H7z"/>',
  wide: '<path d="M5 9h14l-1.5 10h-11L5 9Z"/><path d="M4 6h16v3H4z"/>',
  fluted: '<path d="M7 9h10l-1.2 10H8.2L7 9Z"/><path d="M6 6h12v3H6z"/><path d="M9 10v8m3-8v8m3-8v8"/>',
  handle: '<path d="M7 9h10l-1.1 10H8.1L7 9Z"/><path d="M6 6h12v3H6z"/><path d="M6 11H4v5h3m11-5h2v5h-3"/>',
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${bg}"/><g fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${shapes[pot]}<path d="M32 4v-1m-4 2 4-3 4 3"/></g></svg>`;
}
const data = (s: string) => `data:image/svg+xml,${encodeURIComponent(s)}`;
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.style.setProperty('--accent', a.color);
  root.style.setProperty('--focus', a.color);
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  theme?.setAttribute('content', '#0d0d0d');
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = data(potSvg(a.pot, a.color));
  // Refresh the install manifest metadata for browsers that re-read it before installation.
  const manifest = {
    id: '/', name: 'Pothub', short_name: 'Pothub', start_url: '/', scope: '/',
    display: 'standalone', background_color: '#0d0d0d', theme_color: '#0d0d0d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: data(potSvg(a.pot, a.color)), sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
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
