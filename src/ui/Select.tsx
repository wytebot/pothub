import { useCallback, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useOutside } from './useOutside';

interface Opt<T extends string> { value: T; label: string; }
export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Opt<T>[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useOutside(root, open, close);
  const cur = options.find((o) => o.value === value);
  const pick = (i: number) => { onChange(options[i].value); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="select" ref={root}>
      <button type="button" className="select-btn" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={id} aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen((o) => !o); }} onKeyDown={onKey}>
        <span>{cur?.label}</span><Icon name="chevron" size={14} />
      </button>
      {open && (
        <ul className="popover" role="listbox" id={id} aria-label={label}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === value} className={i === active ? 'active' : ''} onPointerMove={() => setActive(i)} onClick={() => pick(i)}>{o.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
