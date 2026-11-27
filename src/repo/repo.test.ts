import { describe, expect, it } from 'vitest';
import { buildSteps, extractError, isErrorLine, logTail, resolvePaths, type LogLine } from './buildLog';
import { applyBlocks, balanced, checkChange, miniDiff, parseAffected, parseBlocks, parseFiles, stripAffected } from './patch';
import { importsOf, IGNORED } from './imports';
import { afterSend, atQuery, toggleTag } from './tags';
import { rankFiles } from './context';
import { packBlocks } from './agent';

const L = (text: string[]): LogLine[] => text.map((t, i) => ({ t: i, type: 'stdout', text: t }));
const FAILED_BUILD = L([
  'Cloning github.com/wytebot/pothub (Branch: main, Commit: ba24050)', 'Cloning completed: 5.508s',
  'Running "install" command: `npm install`...', 'npm warn deprecated inflight@1.0.6: not supported', 'up to date, audited 422 packages in 2m',
  '> pothub@0.12.1 build', '> tsc --noEmit && vite build',
  "src/pages/Doctor.tsx(2,10): error TS2305: Module '\"../security/api\"' has no exported member 'requestDoctor'.",
  'Error: [BUILD_UTILS_SPAWN_2] Command "npm run build" exited with 2',
]);

describe('build log', () => {
  it('shows the phase that failed and what never ran', () => {
    const s = buildSteps(FAILED_BUILD, 'ERROR');
    expect(s.map((x) => x.state)).toEqual(['done', 'done', 'failed', 'pending']);
  });
  it('shows a running build and a finished one', () => {
    expect(buildSteps(FAILED_BUILD.slice(0, 3), 'BUILDING').map((x) => x.state)).toEqual(['done', 'running', 'pending', 'pending']);
    expect(buildSteps(FAILED_BUILD.slice(0, 6), 'READY').every((x) => x.state === 'done')).toBe(true);
  });
  it('finds the first real error, skips npm noise, and names the file', () => {
    const e = extractError(FAILED_BUILD)!;
    expect(e.summary).toContain('TS2305');
    expect(e.files).toEqual(['src/pages/Doctor.tsx']);
    expect(e.text).toContain('exited with 2');
  });
  it('has no error for a clean log and keeps the end of a long one', () => {
    expect(extractError(L(['npm warn deprecated x', 'Build Completed']))).toBeNull();
    expect(logTail(L(Array.from({ length: 500 }, (_, i) => `line ${i}`)), 10).split('\n')).toHaveLength(10);
  });
  it('marks failing lines but not npm noise', () => {
    expect(isErrorLine("src/a.ts(2,10): error TS2305: Module has no exported member 'x'.")).toBe(true);
    expect(isErrorLine('npm warn deprecated inflight@1.0.6')).toBe(false);
    expect(isErrorLine('Build Completed in /vercel/output [2s]')).toBe(false);
  });
  it('maps a named path onto the repository', () => {
    expect(resolvePaths(['Doctor.tsx', 'src/a.ts', 'missing.ts'], ['src/pages/Doctor.tsx', 'src/a.ts'])).toEqual(['src/pages/Doctor.tsx', 'src/a.ts']);
  });
});

describe('patches', () => {
  it('reads whole files and edit blocks', () => {
    expect(parseFiles('=== FILE: a.ts ===\n```ts\nconst a = 1;\n```\n=== END FILE ===\n=== FILE: b.json ===\n{}\n=== END FILE ===')).toEqual([{ path: 'a.ts', content: 'const a = 1;\n' }, { path: 'b.json', content: '{}\n' }]);
    expect(parseBlocks('<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE')).toEqual([{ search: 'x', replace: 'y' }]);
  });
  it('applies an edit exactly once and refuses ambiguous or missing ones', () => {
    expect(applyBlocks('a\nb\nc', [{ search: 'b', replace: 'B' }])).toEqual({ ok: true, text: 'a\nB\nc' });
    expect(applyBlocks('a  \nb\nc', [{ search: 'a\nb', replace: 'z' }])).toEqual({ ok: true, text: 'z\nc' });
    expect(applyBlocks('x x', [{ search: 'x', replace: 'y' }]).ok).toBe(false);
    expect(applyBlocks('abc', [{ search: 'zzz', replace: 'y' }]).ok).toBe(false);
  });
  it('reads the affected-files block and strips it from the note', () => {
    const t = 'Root cause.\n```json\n{"files":[{"path":"./src/a.ts","action":"edit","reason":"r"},{"path":"b.ts","action":"nope"}]}\n```';
    expect(parseAffected(t)).toEqual([{ path: 'src/a.ts', action: 'edit', reason: 'r' }, { path: 'b.ts', action: 'edit', reason: '' }]);
    expect(stripAffected(t)).toBe('Root cause.');
    expect(parseAffected('no block')).toEqual([]);
  });
  it('refuses truncated, placeholder and invalid output before it is committed', () => {
    expect(balanced('const a = {b: [1, `x${1}`]}; // )')).toBe(true);
    expect(balanced('function f() { if (a) {')).toBe(false);
    expect(checkChange('a.ts', 'x'.repeat(1000), 'x', { whole: true }).ok).toBe(false);
    expect(checkChange('a.ts', 'a', '// ... rest of file\n', { whole: true }).ok).toBe(false);
    expect(checkChange('a.json', '{}', '{', { whole: false }).ok).toBe(false);
    expect(checkChange('a.ts', 'const a = 1;\n', 'const a = 2;\n', { whole: true }).ok).toBe(true);
  });
  it('shows a compact diff', () => { expect(miniDiff('a\nb\nc', 'a\nB\nc')).toEqual(['  a', '- b', '+ B', '  c']); });
});

describe('repository helpers', () => {
  it('excludes credential and environment files from repository context', () => {
    expect(['.env', '.env.production', 'config/service-account.json', 'private/id_rsa', 'certs/client.pem', 'private.key'].every((p) => IGNORED.test(p))).toBe(true);
    expect(['README.md', 'src/main.ts', 'package.json'].every((p) => !IGNORED.test(p))).toBe(true);
  });
  it('finds the files a source imports', () => {
    const paths = new Set(['src/pages/Doctor.tsx', 'src/security/api.ts', 'src/ui/Icon.tsx']);
    expect(importsOf('src/pages/Doctor.tsx', "import { requestDoctor } from '../security/api';\nimport { Icon } from '../ui/Icon';\nimport x from 'react';", paths).sort()).toEqual(['src/security/api.ts', 'src/ui/Icon.tsx']);
  });
  it('ranks files the question points at', () => {
    const r = rankFiles(['src/pages/Doctor.tsx', 'src/a.ts', 'README.md', 'package.json'], 'why does Doctor.tsx fail to build?');
    expect(r[0].path).toBe('src/pages/Doctor.tsx');
  });
  it('keeps every character when packing files into parts', () => {
    const big = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
    const parts = packBlocks([{ path: 'a.ts', text: 'small' }, { path: 'big.ts', text: big }], 1500);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((p) => p.length <= 1500 + 100)).toBe(true);
    expect(parts.join('\n')).toContain('line 399');
  });
});

describe('tagging repositories with @', () => {
  it('ticking sets one mode per repository; ticking it again removes the tag', () => {
    let t = toggleTag([], 'me/a', 'once');
    expect(t).toEqual([{ repo: 'me/a', mode: 'once' }]);
    t = toggleTag(t, 'me/a', 'keep'); expect(t).toEqual([{ repo: 'me/a', mode: 'keep' }]);
    expect(toggleTag(t, 'me/a', 'keep')).toEqual([]);
  });
  it('drops "once" tags after a message is sent and keeps the long ones', () => {
    expect(afterSend([{ repo: 'me/a', mode: 'once' }, { repo: 'me/b', mode: 'keep' }])).toEqual([{ repo: 'me/b', mode: 'keep' }]);
  });
  it('sees the @word at the caret only', () => {
    expect(atQuery('fix @pot', 8)).toEqual({ query: 'pot', start: 4, end: 8 });
    expect(atQuery('mail a@b.com', 12)).toBeNull();
    expect(atQuery('@', 1)).toEqual({ query: '', start: 0, end: 1 });
  });
});
