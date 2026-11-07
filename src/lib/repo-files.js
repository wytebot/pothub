import { MAX_FILE_CHARS, MAX_TOTAL_CHARS, extractReferencedPaths, repoContextNote, repoTreeSummary, suggestFilesForText, truncateForContext } from './repo-mentions.js';

/**
 * Repository file lists and contents for @mentions.
 * The file list is served from memory or IndexedDB instantly and refreshed in the background, so opening the
 * picker never waits on GitHub. Network, cache and clock are injected so this is testable.
 */
export function createRepoFileSource({ api, store, now = Date.now, ttlMs = 5 * 60 * 1000 }) {
  const memory = new Map(), inflight = new Map();
  const keyOf = (repo, branch) => `repo-files:${repo}@${branch || ''}`;
  const split = (repo) => { const [owner, name] = String(repo).split('/'); return { owner, name }; };

  async function fetchList(repo, branch) {
    const { owner, name } = split(repo);
    const d = await api(`/api/github/files?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&branch=${encodeURIComponent(branch)}`);
    const paths = (Array.isArray(d?.files) ? d.files : []).map((f) => f.path).filter(Boolean);
    const entry = { paths, at: now() };
    memory.set(keyOf(repo, branch), entry);
    try { await store?.set(keyOf(repo, branch), entry); } catch { /* cache is best effort */ }
    return entry;
  }

  /** Returns cached paths immediately when any exist (refreshing in the background if stale); otherwise fetches. */
  async function list(repo, branch) {
    const key = keyOf(repo, branch);
    let entry = memory.get(key);
    if (!entry) { try { entry = await store?.get(key); } catch { entry = null; } if (entry) memory.set(key, entry); }
    const refresh = () => inflight.get(key) || (inflight.set(key, fetchList(repo, branch).finally(() => inflight.delete(key))), inflight.get(key));
    if (entry) { if (now() - entry.at > ttlMs) refresh().catch(() => {}); return entry.paths; }
    return (await refresh()).paths;
  }

  async function read(repo, branch, path) {
    const { owner, name } = split(repo);
    const d = await api(`/api/github/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`);
    return String(d?.content ?? '');
  }

  /** Attachments for a message: a context note plus the contents of every @mentioned file that exists. Never throws. */
  async function attachmentsFor(repo, branch, text) {
    let paths = [];
    try { paths = await list(repo, branch); } catch { /* the chat still works without file context */ }
    const explicit = extractReferencedPaths(text, paths), auto = explicit.length ? [] : suggestFilesForText(text, paths), wanted = [...explicit, ...auto], attachments = [], attached = [], failed = [];
    let total = 0;
    for (const path of wanted) {
      if (total >= MAX_TOTAL_CHARS) { failed.push(`${path} (skipped: context limit reached)`); continue; }
      try {
        const body = truncateForContext(await read(repo, branch, path), Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - total));
        total += body.length; attached.push(path);
        attachments.push({ id: `repo:${path}`.slice(0, 100), name: `${repo}:${path}`.slice(-180), type: 'text/plain', size: body.length, textContent: body });
      } catch (e) { failed.push(`${path} (${String(e?.message || 'could not be read').slice(0, 80)})`); }
    }
    const note = repoContextNote(repo, branch, attached, paths.length ? repoTreeSummary(paths) : null, auto.filter((p) => attached.includes(p))) + (failed.length ? `\nThese mentioned files could not be attached: ${failed.join('; ')}.` : '');
    return [{ id: 'repo:context', name: 'repo-context.md', type: 'text/markdown', size: note.length, textContent: note }, ...attachments];
  }

  return { list, read, attachmentsFor };
}
