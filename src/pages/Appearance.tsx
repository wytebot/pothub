import { useEffect, useState } from 'react';
import { applyAppearance, COLORS, DEFAULT_APPEARANCE, getAppearance, potSvg, type Appearance, type PotShape } from '../appearance';

const pots: { id: PotShape; label: string }[] = [
  { id: 'classic', label: 'Classic' }, { id: 'round', label: 'Round' }, { id: 'tall', label: 'Tall' },
  { id: 'wide', label: 'Wide' }, { id: 'fluted', label: 'Fluted' }, { id: 'handle', label: 'Handled' },
];
export function AppearancePage() {
  const [appearance, setAppearance] = useState<Appearance>(getAppearance);
  const update = (next: Appearance) => {
    setAppearance(next);
    localStorage.setItem('pothub.appearance', JSON.stringify(next));
    applyAppearance(next);
  };
  useEffect(() => { applyAppearance(appearance); }, []);
  const downloadIcon = () => {
    const blob = new Blob([potSvg(appearance.pot, appearance.color)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `pothub-${appearance.pot}.svg`; a.click();
    URL.revokeObjectURL(url);
  };
  return <section className="page">
    <div className="page-head"><div><h1>App appearance</h1><p className="muted small">Choose the Pothub pot mark and accent colour used across the app.</p></div></div>
    <div className="panel stack">
      <h2>Pot icon</h2>
      <div className="pot-grid">
        {pots.map(p => <button type="button" key={p.id} className={`pot-option${appearance.pot === p.id ? ' selected' : ''}`} aria-pressed={appearance.pot === p.id} onClick={() => update({ ...appearance, pot: p.id })}>
          <img src={`data:image/svg+xml,${encodeURIComponent(potSvg(p.id, appearance.color))}`} alt="" /><span>{p.label}</span>
        </button>)}
      </div>
    </div>
    <div className="panel stack">
      <h2>Icon and theme colour</h2>
      <p className="muted small">The selected colour updates the pot icon, focus outlines and selected UI accents.</p>
      <div className="color-grid">
        {COLORS.map(c => <button key={c.value} type="button" className={`color-option${appearance.color === c.value ? ' selected' : ''}`} aria-label={c.name} aria-pressed={appearance.color === c.value} onClick={() => update({ ...appearance, color: c.value })}>
          <span style={{ background: c.value }} /><small>{c.name}</small>
        </button>)}
      </div>
      <div className="appearance-preview"><img src={`data:image/svg+xml,${encodeURIComponent(potSvg(appearance.pot, appearance.color))}`} alt="Selected Pothub icon" /><div><strong>Pothub</strong><small className="muted">Your current app mark</small></div></div>
      <div className="row"><button className="btn" onClick={downloadIcon}>Export icon</button><button className="btn" onClick={() => update(DEFAULT_APPEARANCE)}>Reset appearance</button></div>
    </div>
    <div className="panel stack">
      <h2>About the app icon</h2>
      <p className="muted small">Your choice changes the icon in the browser tab straight away. The icon on your home screen or app drawer does not change on its own: it updates when the app is reinstalled.</p>
    </div>
  </section>;
}
