const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  editor: 'M3 8l9-5 9 5-9 5zM3 13l9 5 9-5',
  folder: 'M3 6h6l2 2h10v11H3z',
  key: 'M4 15a4 4 0 1 0 8 0 4 4 0 1 0-8 0M10.8 12.2L20 3M16 7l3 3',
  card: 'M3 6h18v12H3zM3 10h18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevron: 'M6 9l6 6 6-6',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
};
export function Icon({ name, size = 18 }: { name: keyof typeof P; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'dots' ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
