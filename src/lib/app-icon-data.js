// Pure data (no browser APIs) so the React UI, the build scripts and the Android
// configuration script all draw exactly the same icons.
//
// Every glyph is drawn on a 512x512 canvas. Roles:
//   main = white pot body, cut = detail carved out in the icon's background colour.
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0-${r * 2} 0z`;

export const ICON_COLORS = [
  { id: 'midnight', name: 'Midnight', bg: '#0b0d10', accent: '#2f81f7', hover: '#4493f8', lightAccent: '#0969da', lightHover: '#0550ae' },
  { id: 'indigo',   name: 'Indigo',   bg: '#4338ca', accent: '#5b5bf0', hover: '#7373f5', lightAccent: '#4338ca', lightHover: '#3730a3' },
  { id: 'emerald',  name: 'Emerald',  bg: '#17803f', accent: '#1f9d55', hover: '#2db86a', lightAccent: '#1a7f37', lightHover: '#116329' },
  { id: 'orange',   name: 'Sunset',   bg: '#d9540a', accent: '#e8590c', hover: '#f76707', lightAccent: '#bc4c00', lightHover: '#953800' },
  { id: 'crimson',  name: 'Crimson',  bg: '#c4202e', accent: '#dc2f3c', hover: '#f0434f', lightAccent: '#cf222e', lightHover: '#a40e26' },
  { id: 'violet',   name: 'Violet',   bg: '#6d3fd0', accent: '#8a5cf5', hover: '#9d78f7', lightAccent: '#8250df', lightHover: '#6639ba' },
  { id: 'rose',     name: 'Rose',     bg: '#c22675', accent: '#db2f84', hover: '#ec4899', lightAccent: '#bf3989', lightHover: '#99286e' },
  { id: 'teal',     name: 'Lagoon',   bg: '#0b8793', accent: '#0e9aa7', hover: '#14b2c0', lightAccent: '#0b7a85', lightHover: '#075e68' },
  { id: 'gold',     name: 'Amber',    bg: '#b97a00', accent: '#c98a04', hover: '#dba10c', lightAccent: '#9a6700', lightHover: '#7d4e00' },
];

// fit = { s, cx, cy } scales and centres the glyph inside the maskable-safe circle.
// Values are produced by design/icons/measure-fit.py; classic keeps the original artwork untouched.
export const POT_FORMS = [
  {
    id: 'classic', name: 'Classic', fit: { s: 1.0, cx: 256.0, cy: 256.0 },
    shapes: [
      { r: 'main', d: 'M222 106h68v48h-68z' },
      { r: 'main', d: 'M202 88h108v22H202z' },
      { r: 'main', d: 'M132 166h248v24H132z' },
      { r: 'main', d: 'M151 199h210l-18 147c-25 24-54 37-87 37s-62-13-87-37z' },
      { r: 'main', d: 'M151 229h-25c-19 0-34 15-34 34v18c0 19 15 34 34 34h31v-24h-31c-6 0-10-4-10-10v-18c0-6 4-10 10-10h25z' },
      { r: 'main', d: 'M361 229h25c19 0 34 15 34 34v18c0 19-15 34-34 34h-31v-24h31c6 0 10-4 10-10v-18c0-6-4-10-10-10h-25z' },
      { r: 'main', d: 'M190 395h132v18H190z' },
    ],
  },
  {
    id: 'cauldron', name: 'Cauldron', fit: { s: 1.083, cx: 256.0, cy: 267.5 },
    shapes: [
      { r: 'main', d: 'M130 190c0-84 252-84 252 0h-28c0-52-196-52-196 0z' },
      { r: 'main', d: 'M136 186h240c13 0 22 9 22 22s-9 22-22 22H136c-13 0-22-9-22-22s9-22 22-22z' },
      { r: 'main', d: 'M138 230h236c10 40 4 84-28 114-24 22-56 32-90 32s-66-10-90-32c-32-30-38-74-28-114z' },
      { r: 'main', d: 'M176 360l-26 46h36l16-38z' },
      { r: 'main', d: 'M336 360l26 46h-36l-16-38z' },
      { r: 'main', d: 'M236 372h40v36h-40z' },
      { r: 'cut', d: circle(222, 292, 15) },
      { r: 'cut', d: circle(280, 316, 11) },
      { r: 'cut', d: circle(304, 270, 8) },
    ],
  },
  {
    id: 'stockpot', name: 'Stock pot', fit: { s: 1.035, cx: 256.0, cy: 251.0 },
    shapes: [
      { r: 'main', d: 'M240 96h32c6 0 10 4 10 10v10h-52v-10c0-6 4-10 10-10z' },
      { r: 'main', d: 'M132 150c4-26 56-38 124-38s120 12 124 38z' },
      { r: 'main', d: 'M124 150h264v22H124z' },
      { r: 'main', d: 'M138 182h236v188c0 22-14 36-36 36H174c-22 0-36-14-36-36z' },
      { r: 'main', d: 'M138 214h-26c-14 0-24 10-24 24v8c0 14 10 24 24 24h26v-20h-22c-3 0-6-3-6-6v-4c0-3 3-6 6-6h22z' },
      { r: 'main', d: 'M374 214h26c14 0 24 10 24 24v8c0 14-10 24-24 24h-26v-20h22c3 0 6-3 6-6v-4c0-3-3-6-6-6h-22z' },
      { r: 'cut', d: 'M138 296h236v10H138z' },
    ],
  },
  {
    id: 'saucepan', name: 'Saucepan', fit: { s: 0.965, cx: 269.5, cy: 251.0 },
    shapes: [
      { r: 'main', d: 'M180 108h32c5 0 8 3 8 8v16h-48v-16c0-5 3-8 8-8z' },
      { r: 'main', d: 'M114 176c4-30 36-44 82-44s78 14 82 44z' },
      { r: 'main', d: 'M102 176h188c6 0 10 4 10 10v8c0 6-4 10-10 10H102c-6 0-10-4-10-10v-8c0-6 4-10 10-10z' },
      { r: 'main', d: 'M110 204h172v140c0 28-20 50-48 50H158c-28 0-48-22-48-50z' },
      { r: 'main', d: 'M282 226L424 198c10-2 20 4 22 14c2 10-4 18-14 20L282 262z' },
      { r: 'cut', d: circle(424, 216, 7) },
      { r: 'cut', d: 'M110 276h172v10H110z' },
    ],
  },
  {
    id: 'dutchoven', name: 'Dutch oven', fit: { s: 1.013, cx: 256.0, cy: 242.0 },
    shapes: [
      { r: 'main', d: circle(256, 112, 22) },
      { r: 'main', d: 'M244 128h24v22h-24z' },
      { r: 'main', d: 'M120 196c0-34 56-52 136-52s136 18 136 52z' },
      { r: 'main', d: 'M112 196h288c6 0 10 4 10 10v8c0 6-4 10-10 10H112c-6 0-10-4-10-10v-8c0-6 4-10 10-10z' },
      { r: 'main', d: 'M122 228h268l-8 100c-2 40-30 66-72 66H202c-42 0-70-26-72-66z' },
      { r: 'main', d: 'M124 246h-26c-14 0-22 8-22 20v16c0 12 8 20 22 20h30v-22h-24c-3 0-4-1-4-4v-6c0-3 1-4 4-4h20z' },
      { r: 'main', d: 'M388 246h26c14 0 22 8 22 20v16c0 12-8 20-22 20h-30v-22h24c3 0 4-1 4-4v-6c0-3-1-4-4-4h-20z' },
      { r: 'cut', d: 'M130 338h252v10H130z' },
    ],
  },
  {
    id: 'tagine', name: 'Tagine', fit: { s: 1.09, cx: 256.0, cy: 235.0 },
    shapes: [
      { r: 'main', d: circle(256, 92, 16) },
      { r: 'main', d: 'M240 106h32c10 50 62 104 104 148H136c42-44 94-98 104-148z' },
      { r: 'main', d: 'M120 254h272c6 0 10 4 10 10v14H110v-14c0-6 4-10 10-10z' },
      { r: 'main', d: 'M124 286h264l-18 62c-8 28-34 46-64 46H206c-30 0-56-18-64-46z' },
      { r: 'cut', d: circle(256, 208, 11) },
      { r: 'cut', d: 'M150 318h212v8H150z' },
    ],
  },
  {
    id: 'teapot', name: 'Teapot', fit: { s: 0.987, cx: 253.0, cy: 244.0 },
    shapes: [
      { r: 'main', d: circle(256, 110, 14) },
      { r: 'main', d: 'M206 150c0-22 22-34 50-34s50 12 50 34z' },
      { r: 'main', d: 'M196 150h120v14H196z' },
      { r: 'main', d: 'M256 164c-62 0-108 40-108 98 0 62 44 108 108 108s108-46 108-108c0-58-46-98-108-98z' },
      { r: 'main', d: 'M150 296c-34-10-54-50-62-92l-10-34 36-8 8 22c8 28 28 56 46 68z' },
      { r: 'main', d: 'M360 218c40-6 68 16 68 54 0 42-32 68-68 72l-4-26c24-4 44-18 44-44 0-24-18-34-44-30z' },
      { r: 'main', d: 'M200 364h112v20c0 4-4 8-8 8H208c-4 0-8-4-8-8z' },
      { r: 'cut', d: 'M164 264h184v9H164z' },
    ],
  },
  {
    id: 'plantpot', name: 'Plant pot', fit: { s: 1.029, cx: 256.0, cy: 260.5 },
    shapes: [
      { r: 'main', d: 'M250 262v-96h12v96z' },
      { r: 'main', d: 'M250 200c-44 4-80-18-92-62 44-6 84 14 92 62z' },
      { r: 'main', d: 'M262 168c8-48 48-68 92-62-8 44-48 66-92 62z' },
      { r: 'main', d: 'M142 258h228c8 0 14 6 14 14v22H128v-22c0-8 6-14 14-14z' },
      { r: 'main', d: 'M142 304h228l-22 92c-3 12-13 20-26 20H190c-13 0-23-8-26-20z' },
      { r: 'cut', d: 'M164 346h184v9H164z' },
    ],
  },
];

export const DEFAULT_ICON = { form: 'classic', color: 'midnight' };
export const iconId = (c) => `${c.form}-${c.color}`;
export const findForm = (id) => POT_FORMS.find((f) => f.id === id) || POT_FORMS[0];
export const findColor = (id) => ICON_COLORS.find((c) => c.id === id) || ICON_COLORS[0];
export const normalizeIcon = (value) => ({
  form: findForm(value?.form).id,
  color: findColor(value?.color).id,
});
export const isDefaultIcon = (c) => c.form === DEFAULT_ICON.form && c.color === DEFAULT_ICON.color;

// Static, pre-rendered files in /public/icons/themes (generated by design/icons/render-icons.py).
export const iconAssets = (c) => {
  const id = iconId(c);
  if (isDefaultIcon(c)) return { id, png192: '/icons/pothub-192.png', png512: '/icons/pothub-512.png', manifest: '/manifest.webmanifest' };
  return { id, png192: `/icons/themes/${id}-192.png`, png512: `/icons/themes/${id}-512.png`, manifest: `/icons/themes/${id}.webmanifest` };
};

// Transform that places a form's artwork inside the 512 canvas.
export const fitTransform = (form, extraScale = 1) => {
  const { s, cx, cy } = form.fit;
  const k = s * extraScale;
  return { k, tx: 256 - k * cx, ty: 256 - k * cy };
};

// Plain SVG string (used by scripts and for data-URL favicons).
export function iconSvgString(choice, { rounded = false, size = 512 } = {}) {
  const form = findForm(choice.form), color = findColor(choice.color), { k, tx, ty } = fitTransform(form);
  const body = form.shapes.map((s) => `<path fill="${s.r === 'cut' ? color.bg : '#f0f6fc'}" d="${s.d}"/>`).join('');
  const rx = rounded ? ' rx="112"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><rect width="512" height="512"${rx} fill="${color.bg}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${body}</g></svg>`;
}
