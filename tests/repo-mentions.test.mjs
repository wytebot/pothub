import { extractReferencedPaths, repoTreeSummary } from '../src/lib/repo-mentions.js';
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

test('context note carries a file outline so the agent knows what exists without reading it', async () => {
  const { src } = source();
  const out = await src.attachmentsFor('o/r', 'main', 'hello');
  assert.match(out[0].textContent, /Repository file outline \(\d+ files/);
  assert.match(out[0].textContent, /server\/: .*app\.js/);
});

test('bare paths and stack-trace paths count as references, but only real files', () => {
  const known = ['src/ui/App.jsx', 'server/app.js', 'package.json'];
  assert.deepEqual(extractReferencedPaths('crash at src/ui/App.jsx:328:5 and (server/app.js:10) plus fake/none.js', known), ['src/ui/App.jsx', 'server/app.js']);
  assert.deepEqual(extractReferencedPaths('see @package.json and package.json', known), ['package.json']);
  assert.deepEqual(extractReferencedPaths('nothing here', known), []);
});

test('with no explicit file, files whose names match the request are attached and labelled as a guess', async () => {
  const api = async (p) => p.startsWith('/api/github/files')
    ? { files: [{ path: 'server/billing-policy.js' }, { path: 'src/ui/App.jsx' }, { path: 'public/icons/a.png' }] }
    : { content: 'BILLING CODE' };
  const out = await createRepoFileSource({ api, store: null }).attachmentsFor('o/r', 'main', 'the billing page is wrong');
  assert.equal(out.length, 2);
  assert.equal(out[1].name, 'o/r:server/billing-policy.js');
  assert.match(out[0].textContent, /because their names match the request: server\/billing-policy\.js\. They are a guess/);
  assert.doesNotMatch(out[0].textContent, /a\.png/);
});

test('repoTreeSummary drops noise and stays within its size bound', () => {
  const many = Array.from({ length: 4000 }, (_, i) => `src/dir${i % 50}/file${i}.js`);
  const t = repoTreeSummary(['package-lock.json', 'public/x.png', 'README.md', ...many], 3000);
  assert.ok(t.text.length < 3200);
  assert.doesNotMatch(t.text, /package-lock|x\.png/);
  assert.ok(t.omitted > 0 && /more files not listed/.test(t.text));
});

test('a bare file name attaches the file; ambiguous names attach nothing', async () => {
  const { extractNamedPaths } = await import('../src/lib/repo-mentions.js');
  assert.deepEqual(extractNamedPaths('show me WorkspaceSection.jsx please', FILES), ['src/ui/WorkspaceSection.jsx']);
  assert.deepEqual(extractNamedPaths('what is in db.js?', FILES), ['src/lib/db.js']);
  assert.deepEqual(extractNamedPaths('nothing.js here', FILES), []);
  const many = ['a/index.js', 'b/index.js', 'c/index.js', 'd/index.js'];
  assert.deepEqual(extractNamedPaths('open index.js', many), [], 'too ambiguous');
  const { src } = source();
  const out = await src.attachmentsFor('o/r', 'main', 'show me app.js');
  assert.ok(out.some((a) => a.name === 'o/r:server/app.js' && a.textContent === 'APP CODE'));
});

test('a follow-up with no path keeps the files the conversation was about', async () => {
  const { extractCarriedPaths } = await import('../src/lib/repo-mentions.js');
  const history = [{ role: 'user', content: 'Why is server/app.js failing?' }, { role: 'assistant', content: 'I need to read server/app.js to answer.' }];
  assert.deepEqual(extractCarriedPaths(history, FILES), ['server/app.js']);
  assert.deepEqual(extractCarriedPaths([], FILES), []);
  assert.deepEqual(extractCarriedPaths(undefined, FILES), []);
  const { src } = source();
  const out = await src.attachmentsFor('o/r', 'main', 'yes, go ahead', { history });
  assert.deepEqual(out.slice(1).map((a) => [a.name, a.textContent]), [['o/r:server/app.js', 'APP CODE']]);
  assert.match(out[0].textContent, /attached these files again because this conversation was already about them: server\/app\.js/);
  assert.doesNotMatch(out[0].textContent, /No files were attached/);
  const direct = await src.attachmentsFor('o/r', 'main', 'now check @src/lib/db.js', { history });
  assert.deepEqual(direct.slice(1).map((a) => a.name), ['o/r:src/lib/db.js'], 'a file named in this message wins over earlier ones');
});
