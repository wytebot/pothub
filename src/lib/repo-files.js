import { MAX_FILE_CHARS, MAX_TOTAL_CHARS, extractCarriedPaths, extractNamedPaths, extractReferencedPaths, isSyncablePath, repoContextNote, repoTreeSummary, repoWorkspaceName, suggestFilesForText, truncateForContext } from './repo-mentions.js';

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

  /** Read several files with a few requests in flight, then keep as many as fit the context budget (in the order given). */
  async function readBundle(repo, branch, paths, { concurrency = 5, maxTotal = MAX_TOTAL_CHARS } = {}) {
    const bodies = new Array(paths.length);
    let next = 0;
    const worker = async () => {
      while (next < paths.length) {
        const i = next++;
        try { bodies[i] = { body: await read(repo, branch, paths[i]) }; } catch (e) { bodies[i] = { error: String(e?.message || 'could not be read').slice(0, 80) }; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
    const attachments = [], attached = [], failed = [];
    let total = 0;
    paths.forEach((path, i) => {
      const r = bodies[i];
      if (r?.error) { failed.push(`${path} (${r.error})`); return; }
      if (total >= maxTotal) { failed.push(`${path} (skipped: context limit reached)`); return; }
      const body = truncateForContext(r.body, Math.min(MAX_FILE_CHARS, maxTotal - total));
      total += body.length; attached.push(path);
      attachments.push({ id: `repo:${path}`.slice(0, 100), name: `${repo}:${path}`.slice(-180), type: 'text/plain', size: body.length, textContent: body });
    });
    return { attachments, attached, failed };
  }

  /** Answer an agent's pothub-read request: the real contents of the requested files, as one tool-result message. */
  async function readRequested(repo, branch, paths) {
    const b = await readBundle(repo, branch, paths, { maxTotal: MAX_TOTAL_CHARS });
    const blocks = b.attachments.map((a, i) => `### ${b.attached[i]}\n\`\`\`\n${a.textContent}\n\`\`\``);
    const text = [`Repository files you requested from ${repo}${branch ? ` (branch ${branch})` : ''}. These are the real, complete contents; continue your answer using them.`, ...blocks, b.failed.length ? `Could not be read: ${b.failed.join('; ')}.` : ''].filter(Boolean).join('\n\n');
    return { text, attached: b.attached, failed: b.failed };
  }

  /** Attachments for a message: a context note plus the contents of every @mentioned file that exists. Never throws. */
  async function attachmentsFor(repo, branch, text, opts = {}) {
    let paths = [];
    try { paths = await list(repo, branch); } catch { /* the chat still works without file context */ }
    const named = extractReferencedPaths(text, paths), bare = named.length ? [] : extractNamedPaths(text, paths), forced = (Array.isArray(opts?.force) ? opts.force : []).filter((p) => paths.includes(p)), direct = [...new Set([...forced, ...named, ...bare])], carried = direct.length ? [] : extractCarriedPaths(opts?.history, paths), auto = direct.length ? [] : suggestFilesForText(text, paths).filter((p) => !carried.includes(p)), wanted = [...new Set([...direct, ...carried, ...auto])], attachments = [], attached = [], failed = [];
    const bundle = await readBundle(repo, branch, wanted);
    attachments.push(...bundle.attachments); attached.push(...bundle.attached); failed.push(...bundle.failed);
    const note = repoContextNote(repo, branch, attached, paths.length ? repoTreeSummary(paths) : null, auto.filter((p) => attached.includes(p)), opts?.pin || null, carried.filter((p) => attached.includes(p))) + (failed.length ? `\nThese mentioned files could not be attached: ${failed.join('; ')}.` : '');
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

  return { list, read, attachmentsFor, readRequested, syncToTermux, forgetSync };
}
