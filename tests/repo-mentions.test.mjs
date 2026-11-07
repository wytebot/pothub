import test from 'node:test';
import assert from 'node:assert/strict';
import { activeMention, rankFiles, applyMention, extractMentionedPaths, truncateForContext, MAX_MENTIONED_FILES } from '../src/lib/repo-mentions.js';
import { createRepoFileSource } from '../src/lib/repo-files.js';

const FILES = ['README.md', 'package.json', 'server/app.js', 'server/lib.js', 'src/ui/App.jsx', 'src/ui/WorkspaceSection.jsx', 'src/lib/db.js', 'tests/app.test.mjs'];

test('activeMention only fires for @ at the start or after whitespace', () => {
  assert.deepEqual(activeMention('look at @ser'), { start: 8, query: 'ser' });
  assert.deepEqual(activeMention('@'), { start: 0, query: '' });
  assert.equal(activeMention('email me at a@b.com'), null);
  assert.equal(activeMention('no mention here'), null);
  assert.equal(activeMention('see @server/app.js and then more'), null, 'finished mention is not active');
  assert.deepEqual(activeMention('hi @a and @src/u', 16), { start: 10, query: 'src/u' });
});

test('rankFiles prefers exact and filename matches, then paths, then fuzzy; empty query lists shallow files first', () => {
  assert.equal(rankFiles(FILES, 'app')[0].path, 'server/app.js');
  assert.deepEqual(rankFiles(FILES, 'app.jsx').map((r) => r.path)[0], 'src/ui/App.jsx');
  assert.equal(rankFiles(FILES, 'readme')[0].path, 'README.md');
  assert.equal(rankFiles(FILES, 'wss')[0].path, 'src/ui/WorkspaceSection.jsx', 'fuzzy subsequence');
  assert.deepEqual(rankFiles(FILES, 'zzzz'), []);
  assert.deepEqual(rankFiles(FILES, '', 2).map((r) => r.path), ['README.md', 'package.json']);
  assert.equal(rankFiles(FILES, 'server/').length, 2);
  assert.equal(rankFiles(Array.from({ length: 100 }, (_, i) => `f${i}.js`), 'f', 8).length, 8);
  const r = rankFiles(FILES, 'lib.js').find((x) => x.path === 'server/lib.js'); assert.deepEqual([r.name, r.dir], ['lib.js', 'server']);
});

test('applyMention replaces just the token and moves the caret after the inserted path', () => {
  const text = 'explain @ser please', mention = activeMention(text, 12);
  const out = applyMention(text, 12, mention, 'server/app.js');
  assert.equal(out.text, 'explain @server/app.js  please');
  assert.equal(out.caret, 'explain @server/app.js '.length);
});

test('extractMentionedPaths keeps only real files, strips trailing punctuation, dedupes and caps', () => {
  assert.deepEqual(extractMentionedPaths('fix @server/app.js, then @src/lib/db.js. Also @nope.txt and @server/app.js', FILES), ['server/app.js', 'src/lib/db.js']);
  assert.deepEqual(extractMentionedPaths('(@README.md)', FILES), ['README.md']);
  assert.deepEqual(extractMentionedPaths('mail a@README.md', FILES), []);
  const many = Array.from({ length: 20 }, (_, i) => `f${i}.js`);
  assert.equal(extractMentionedPaths(many.map((f) => `@${f}`).join(' '), many).length, MAX_MENTIONED_FILES);
});

test('truncateForContext marks truncation honestly', () => {
  assert.equal(truncateForContext('abc', 10), 'abc');
  assert.match(truncateForContext('x'.repeat(50), 10), /truncated this file at 10 characters/);
});

function source(overrides = {}) {
  const calls = []; const mem = new Map(); let t = 1000;
  const api = async (path) => { calls.push(path);
    if (path.startsWith('/api/github/files')) return { files: FILES.map((p) => ({ path: p })) };
    if (path.includes('path=server%2Fapp.js')) return { content: 'APP CODE' };
    if (path.includes('path=boom')) throw new Error('GitHub unavailable');
    return { content: 'OTHER' }; };
  const store = { get: async (k) => mem.get(k), set: async (k, v) => { mem.set(k, v); } };
  const src = createRepoFileSource({ api, store, now: () => t, ...overrides });
  return { src, calls, mem, tick: (ms) => { t += ms; } };
}

test('file list: fetched once, then served from memory and IndexedDB; stale lists refresh in the background', async () => {
  const { src, calls, mem, tick } = source();
  assert.deepEqual(await src.list('o/r', 'main'), FILES);
  assert.deepEqual(await src.list('o/r', 'main'), FILES);
  assert.equal(calls.filter((c) => c.startsWith('/api/github/files')).length, 1);
  assert.ok(mem.has('repo-files:o/r@main'));
  const fresh = createRepoFileSource({ api: async () => { throw new Error('offline'); }, store: { get: async (k) => mem.get(k), set: async () => {} } });
  assert.deepEqual(await fresh.list('o/r', 'main'), FILES, 'works offline from the saved list');
  tick(6 * 60 * 1000);
  assert.deepEqual(await src.list('o/r', 'main'), FILES, 'stale entry is returned immediately');
  assert.equal(calls.filter((c) => c.startsWith('/api/github/files')).length, 2, 'and refreshed in the background');
});

test('attachmentsFor adds a context note plus mentioned files, and survives failures', async () => {
  const { src } = source();
  const out = await src.attachmentsFor('o/r', 'main', 'why does @server/app.js and @nope.js fail?');
  assert.equal(out[0].name, 'repo-context.md');
  assert.match(out[0].textContent, /GitHub repository o\/r \(branch main\)/);
  assert.match(out[0].textContent, /server\/app\.js/);
  assert.match(out[0].textContent, /Do not claim to have read files that are not attached/);
  assert.deepEqual(out.slice(1).map((a) => [a.name, a.textContent]), [['o/r:server/app.js', 'APP CODE']]);
});

test('a file that cannot be read is reported to the model, never thrown', async () => {
  const api = async (p) => { if (p.startsWith('/api/github/files')) return { files: [{ path: 'boom' }] }; throw new Error('GitHub unavailable'); };
  const src = createRepoFileSource({ api, store: null });
  const out = await src.attachmentsFor('o/r', 'main', 'check @boom');
  assert.equal(out.length, 1);
  assert.match(out[0].textContent, /could not be attached: boom \(GitHub unavailable\)/);
});

test('if the file list cannot load at all, the chat still gets a context note', async () => {
  const src = createRepoFileSource({ api: async () => { throw new Error('offline'); }, store: null });
  const out = await src.attachmentsFor('o/r', 'main', 'hi @x');
  assert.equal(out.length, 1); assert.match(out[0].textContent, /No files were attached/);
});
