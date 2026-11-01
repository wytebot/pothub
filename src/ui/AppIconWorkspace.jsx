import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { ICON_COLORS, POT_FORMS, DEFAULT_ICON, findColor, findForm, fitTransform, isDefaultIcon } from '../lib/app-icon-data';

export function PotIconSvg({ choice, size = 64, label }) {
  const form = findForm(choice.form), color = findColor(choice.color), { k, tx, ty } = fitTransform(form);
  return (
    <svg className="pot-icon-svg" viewBox="0 0 512 512" width={size} height={size} role="img"
      aria-label={label || `${form.name} pot, ${color.name}`} xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="112" fill={color.bg} />
      <g transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})`}>
        {form.shapes.map((shape, index) => <path key={index} d={shape.d} fill={shape.r === 'cut' ? color.bg : '#f0f6fc'} />)}
      </g>
    </svg>
  );
}

export default function AppIconWorkspace({ choice, onChange, nativeApp, status }) {
  const form = findForm(choice.form), color = findColor(choice.color);
  const set = (patch) => onChange({ ...choice, ...patch });
  return (
    <section className="appicon-page">
      <div className="page-heading">
        <div>
          <h1>App icon &amp; color</h1>
          <p>Pick a pot and a color. Your choice recolors Pothub and changes the icon on your devices.</p>
        </div>
      </div>

      <div className="panel appicon-preview">
        <PotIconSvg choice={choice} size={96} label="Selected app icon preview" />
        <div className="appicon-preview-text">
          <h2>{form.name} · {color.name}</h2>
          <ul className="appicon-effects">
            <li><Check aria-hidden="true" /> Accent color across the whole app</li>
            <li><Check aria-hidden="true" /> Browser tab and installed web-app icon</li>
            <li><Check aria-hidden="true" /> {nativeApp ? 'Android launcher icon' : 'Android launcher icon in the Pothub APK'}</li>
          </ul>
          <button type="button" className="secondary" disabled={isDefaultIcon(choice)} onClick={() => onChange({ ...DEFAULT_ICON })}>
            <RotateCcw aria-hidden="true" /> Reset to original
          </button>
        </div>
      </div>

      {status && <p className="appicon-status" role="status">{status}</p>}

      <div className="panel">
        <div className="panel-heading"><h2>Color</h2><span>{color.name}</span></div>
        <div className="appicon-colors" role="group" aria-label="Icon color">
          {ICON_COLORS.map((c) => (
            <button key={c.id} type="button" className={`appicon-swatch ${c.id === choice.color ? 'selected' : ''}`}
              aria-pressed={c.id === choice.color} aria-label={c.name} title={c.name}
              style={{ '--swatch-bg': c.bg, '--swatch-dot': c.accent }} onClick={() => set({ color: c.id })}>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading"><h2>Pot</h2><span>{form.name}</span></div>
        <div className="appicon-grid" role="group" aria-label="Pot shape">
          {POT_FORMS.map((f) => (
            <button key={f.id} type="button" className={`appicon-tile ${f.id === choice.form ? 'selected' : ''}`}
              aria-pressed={f.id === choice.form} onClick={() => set({ form: f.id })}>
              <PotIconSvg choice={{ form: f.id, color: choice.color }} size={72} label={`${f.name} pot`} />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel appicon-help">
        <h2>On your devices</h2>
        <p><b>Android app (APK):</b> the launcher icon switches right away; some launchers take a few seconds to redraw it.</p>
        <p><b>Installed web app:</b> Chrome on Android refreshes the home-screen icon on its own within a day or so. On iPhone and iPad, remove the app and use Add to Home Screen again to pick up the new icon.</p>
        <p><b>Browser tab:</b> updates immediately.</p>
      </div>
    </section>
  );
}
