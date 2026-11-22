import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });

describe('Icon names', () => {
  it('every <Icon name="..."> used in the app exists in the icon set', () => {
    const defined = new Set([...readFileSync('src/ui/Icon.tsx', 'utf8').matchAll(/^\s*'?([\w-]+)'?:\s*'M/gm)].map((m) => m[1]));
    const missing: string[] = [];
    for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/<Icon\s+name=(?:"([\w-]+)"|\{'([\w-]+)'\})/g)) { const n = m[1] ?? m[2]; if (!defined.has(n)) missing.push(`${f}: ${n}`); }
    expect(missing).toEqual([]);
  });
});
