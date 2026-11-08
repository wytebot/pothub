import { MAX_FILE_CHARS, MAX_TOTAL_CHARS, extractReferencedPaths, isSyncablePath, repoContextNote, repoTreeSummary, repoWorkspaceName, suggestFilesForText, truncateForContext } from './repo-mentions.js';

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
  async function attachmentsFor(repo, branch, text, opts = {}) {
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
    const note = repoContextNote(repo, branch, attached, paths.length ? repoTreeSummary(paths) : null, auto.filter((p) => attached.includes(p)), opts?.pin || null) + (failed.length ? `\nThese mentioned files could not be attached: ${failed.join('; ')}.` : '');
    return [{ id: 'repo:context', name: 'repo-context.md', type: 'text/markdown', size: note.length, textContent: note }, ...attachments];
  }

  const synced = new Map();
  /**
   * Copy the whole repository (readable text files) into the person's Termux so the agent can search and read all of it with
   * commands. Done once per repo and branch; `mirror` is off so edits already made in the Termux copy are not deleted.
   * `sync` is injected (agent-runtime.syncProjectToTermux) so this stays testable.
   */
  async function syncToTermux(repo, branch, { sync, onProgress, signal, concurrency = 6, maxFiles = 700, maxFileChars = 400000, maxBytes = 30 * 1024 * 1024 } = {}) {
    const key = `${repo}@${branch || ''}`, hit = synced.get(key), name = repoWorkspaceName(repo);
    if (hit && now() - hit.at < 6 * 60 * 60 * 1000) return { ...hit.result, cached: true };
    const paths = (await list(repo, branch)).filter(isSyncablePath).slice(0, maxFiles);
    if (!paths.length) throw new Error('No readable source files were found in this repository.');
    const files = {}, skipped = [];
    let next = 0, done = 0, bytes = 0;
    const worker = async () => {
      while (next < paths.length) {
        if (signal?.aborted) throw new Error('Cancelled.');
        const path = paths[next++];
        try {
          const body = await read(repo, branch, path);
          if (body.length > maxFileChars || bytes + body.length > maxBytes) skipped.push(path); else { bytes += body.length; files[path] = body; }
        } catch { skipped.push(path); }
        onProgress?.({ done: ++done, total: paths.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
    if (!Object.keys(files).length) throw new Error('None of the repository files could be read.');
    await sync({ name, files, mirror: false, approved: true, signal });
    const result = { workspace: name, files: Object.keys(files).length, skipped: skipped.length };
    synced.set(key, { at: now(), result });
    return result;
  }
  const forgetSync = (repo) => { for (const k of [...synced.keys()]) if (k.startsWith(`${repo}@`)) synced.delete(k); };

  return { list, read, attachmentsFor, syncToTermux, forgetSync };
}
