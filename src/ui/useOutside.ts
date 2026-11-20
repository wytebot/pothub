import { useEffect, type RefObject } from 'react';
export function useOutside(ref: RefObject<HTMLElement | null>, active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [ref, active, close]);
}
