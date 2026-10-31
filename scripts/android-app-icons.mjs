// Generates the Android launcher-icon variants (one activity-alias per pot x color)
// as vector drawables + adaptive icons, so no extra PNGs are needed. Called by
// scripts/configure-android.mjs; safe to run repeatedly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { POT_FORMS, ICON_COLORS, iconId, isDefaultIcon, fitTransform } = await import(pathToFileURL(path.join(here, '..', 'src', 'lib', 'app-icon-data.js')).href);
const ident = (id) => id.replace(/-/g, '_');
const ADAPTIVE_SCALE = 0.78; // keeps the pot inside Android's 66dp adaptive-icon safe zone

const vector = (form, color) => {
  const { k, tx, ty } = fitTransform(form, ADAPTIVE_SCALE);
  const paths = form.shapes.map((s) => `    <path android:fillColor="${s.r === 'cut' ? color.bg.toUpperCase() : '#F0F6FC'}" android:pathData="${s.d}"/>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512">\n  <group android:translateX="${tx.toFixed(2)}" android:translateY="${ty.toFixed(2)}" android:scaleX="${k.toFixed(4)}" android:scaleY="${k.toFixed(4)}">\n${paths}\n  </group>\n</vector>\n`;
};

export function configureAppIcons({ resDir, manifestPath, pkg }) {
  const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  const combos = POT_FORMS.flatMap((form) => ICON_COLORS.map((color) => ({ form, color, id: iconId({ form: form.id, color: color.id }) })));
  const variants = combos.filter((c) => !isDefaultIcon({ form: c.form.id, color: c.color.id }));

  write(path.join(resDir, 'values', 'pot_icon_colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${ICON_COLORS.map((c) => `  <color name="pot_bg_${c.id}">${c.bg.toUpperCase()}</color>`).join('\n')}\n</resources>\n`);

  for (const { form, color, id } of variants) {
    const name = `pot_${ident(id)}`;
    write(path.join(resDir, 'drawable', `${name}_fg.xml`), vector(form, color));
    const adaptive = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/pot_bg_${color.id}"/><foreground android:drawable="@drawable/${name}_fg"/></adaptive-icon>\n`;
    write(path.join(resDir, 'mipmap-anydpi-v26', `${name}.xml`), adaptive);
    // Android 5-7 have no adaptive icons: a flat square layer-list is the fallback.
    write(path.join(resDir, 'mipmap', `${name}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item><shape android:shape="rectangle"><solid android:color="@color/pot_bg_${color.id}"/></shape></item><item android:drawable="@drawable/${name}_fg"/></layer-list>\n`);
  }

  // Manifest: move the LAUNCHER entry from MainActivity to switchable aliases.
  let xml = fs.readFileSync(manifestPath, 'utf8');
  if (xml.includes('PotIcon_classic_midnight')) return { variants: variants.length, manifestChanged: false };
  const target = xml.match(/<activity\b[^>]*android:name="([^"]*MainActivity)"/)?.[1];
  if (!target) throw new Error('Could not find MainActivity in AndroidManifest.xml for launcher icon aliases.');
  const launcher = /\s*<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"\s*\/>\s*<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>\s*<\/intent-filter>/;
  const end = xml.indexOf('</activity>');
  if (end < 0) throw new Error('Could not locate the end of MainActivity in AndroidManifest.xml.');
  const head = xml.slice(0, end).replace(launcher, ''), tail = xml.slice(end + '</activity>'.length);
  const alias = (id, icon, round, enabled) => `\n        <activity-alias android:name="${pkg}.PotIcon_${ident(id)}" android:targetActivity="${target}" android:enabled="${enabled}" android:exported="true" android:icon="${icon}" android:roundIcon="${round}" android:label="@string/app_name">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity-alias>`;
  const aliases = alias('classic-midnight', '@mipmap/ic_launcher', '@mipmap/ic_launcher_round', 'true')
    + variants.map(({ id }) => alias(id, `@mipmap/pot_${ident(id)}`, `@mipmap/pot_${ident(id)}`, 'false')).join('');
  fs.writeFileSync(manifestPath, `${head}</activity>${aliases}${tail}`);
  return { variants: variants.length, manifestChanged: true };
}
