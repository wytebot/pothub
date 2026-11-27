import { useEffect, useRef } from 'react';
import { isErrorLine } from './buildLog';

/** A scrollable build log. Failing lines are marked, and the view opens on the first one. */
export function LogView({ lines, max = 120 }: { lines: string[]; max?: number }) {
  const box = useRef<HTMLPreElement>(null); const first = useRef<HTMLSpanElement>(null);
  const shown = lines.length > max ? lines.slice(-max) : lines;
  useEffect(() => { const el = box.current; if (!el) return; el.scrollTop = first.current ? Math.max(0, first.current.offsetTop - 48) : el.scrollHeight; }, [shown.length, lines[0]]);
  let marked = false;
  return (
    <pre className="lv" ref={box} tabIndex={0} aria-label="Build log">
      {lines.length > max && <span className="lv-skip">… {lines.length - max} earlier lines</span>}
      {shown.map((t, i) => {
        const bad = isErrorLine(t); const mark = bad && !marked; if (mark) marked = true;
        return <span key={i} ref={mark ? first : undefined} className={`lv-line${bad ? ' bad' : ''}`}>{t || ' '}{'\n'}</span>;
      })}
    </pre>
  );
}
