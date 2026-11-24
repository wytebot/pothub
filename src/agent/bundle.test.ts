import { describe, expect, it } from 'vitest';
import { parseBundle } from './bundle';

describe('parseBundle fallback', () => {
  it('keeps named file markers', () => {
    expect(parseBundle('=== FILE: src/index.ts ===\nexport const ok = true;\n=== END FILE ===')).toEqual([{ path: 'src/index.ts', content: 'export const ok = true;' }]);
  });
  it('uses the fenced source fallback when a single file omits markers', () => {
    expect(parseBundle('```ts\nexport const ok = true;\n```')).toEqual([{ path: 'generated-file.ts', content: 'export const ok = true;' }]);
  });
  it('does not mislabel a named fenced file as generated-file', () => {
    expect(parseBundle('**src/App.tsx**\n```tsx\nexport default function App() {}\n```')).toEqual([{ path: 'src/App.tsx', content: 'export default function App() {}' }]);
  });
});
