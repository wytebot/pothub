import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centred card on larger screens. Closes on Escape or a tap outside. */
export default function Sheet({ open, onClose, title, subtitle, children, footer, busy = false }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, busy, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="vx-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <section className="vx-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="vx-grabber" aria-hidden="true" />
        <header className="vx-sheet-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="vx-icon-btn" aria-label="Close" onClick={onClose} disabled={busy}><X size={18} /></button>
        </header>
        <div className="vx-sheet-body">{children}</div>
        {footer && <footer className="vx-sheet-foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
