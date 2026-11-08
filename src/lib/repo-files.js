import { MAX_FILE_CHARS, MAX_TOTAL_CHARS, rankOverviewFiles, extractCarriedPaths, extractNamedPaths, extractReferencedPaths, isSyncablePath, repoContextNote, repoTreeSummary, repoWorkspaceName, suggestFilesForText, truncateForContext } from './repo-mentions.js';

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
    const rows = (Array.isArray(d?.files) ? d.files : []).filter((f) => f?.path);
    const paths = rows.map((f) => f.path), sizes = Object.fromEntries(rows.map((f) => [f.path, Number(f.size) || 0]));
    const entry = { paths, sizes, at: now() };
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
  const sizesOf = (repo, branch) => memory.get(keyOf(repo, branch))?.sizes || {};

  // File contents are kept for a few minutes so a follow-up message or a search does not download the same files again.
  const contents = new Map();
  async function read(repo, branch, path) {
    const ck = `${keyOf(repo, branch)}:${path}`, hit = contents.get(ck);
    if (hit && now() - hit.at < ttlMs) return hit.body;
    const { owner, name } = split(repo);
    const d = await api(`/api/github/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`);
    const body = String(d?.content ?? '');
    if (contents.size >= 900) contents.delete(contents.keys().next().value);
    contents.set(ck, { body, at: now() });
    return body;
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

  /**
   * Search every readable file of the repository for the given terms (plain text, case-insensitive) and return
   * path:line matches. This is how an agent finds code anywhere without the user tagging a file.
   */
  async function searchRequested(repo, branch, terms, { maxFiles = 450, maxMatches = 90, maxFileChars = 300000, deadlineMs = 30000 } = {}) {
    const wanted = [...new Set((terms || []).map((t) => String(t).trim()).filter((t) => t.length >= 2))];
    if (!wanted.length) return { text: 'No search terms were given.', matches: 0, scanned: 0 };
    const paths = (await list(repo, branch)).filter(isSyncablePath), sizes = sizesOf(repo, branch);
    const files = paths.filter((p) => !(sizes[p] > maxFileChars)).slice(0, maxFiles);
    const lowered = wanted.map((t) => t.toLowerCase()), started = now(), hits = [];
    let next = 0, scanned = 0, timedOut = false;
    const worker = async () => {
      while (next < files.length && hits.length < maxMatches) {
        if (now() - started > deadlineMs) { timedOut = true; return; }
        const path = files[next++];
        let body = '';
        try { body = await read(repo, branch, path); } catch { continue; }
        scanned++;
        const lines = body.split('\n');
        for (let i = 0; i < lines.length && hits.length < maxMatches; i++) {
          const low = lines[i].toLowerCase();
          const term = lowered.findIndex((t) => low.includes(t));
          if (term >= 0) hits.push({ path, line: i + 1, term: wanted[term], text: lines[i].trim().slice(0, 180) });
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    hits.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    const byTerm = wanted.map((t) => `${t}: ${hits.filter((h) => h.term === t).length}`).join(', ');
    const body = hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join('\n');
    const notes = [files.length < paths.length ? `Only the first ${files.length} of ${paths.length} readable files were searched.` : '', timedOut ? 'The search stopped early because it took too long.' : '', hits.length >= maxMatches ? `Showing the first ${maxMatches} matches; search for something narrower to see the rest.` : ''].filter(Boolean).join(' ');
    const text = [`Search results in ${repo}${branch ? ` (branch ${branch})` : ''} for: ${wanted.join(', ')}. Scanned ${scanned} files. Matches per term: ${byTerm}.`, body || 'No matches. Try other spellings, a shorter term, or read a folder from the outline.', notes].filter(Boolean).join('\n\n');
    return { text, matches: hits.length, scanned };
  }

  /** Attachments for a message: a context note plus the contents of every @mentioned file that exists. Never throws. */
  async function attachmentsFor(repo, branch, text, opts = {}) {
    let paths = [];
    try { paths = await list(repo, branch); } catch { /* the chat still works without file context */ }
    const named = extractReferencedPaths(text, paths), bare = named.length ? [] : extractNamedPaths(text, paths), forced = (Array.isArray(opts?.force) ? opts.force : []).filter((p) => paths.includes(p)), direct = [...new Set([...forced, ...named, ...bare])], carried = direct.length ? [] : extractCarriedPaths(opts?.history, paths), auto = direct.length ? [] : suggestFilesForText(text, paths).filter((p) => !carried.includes(p));
    // No file was tagged, named or requested: still start the agent with real code. Fill a budget with the project's key files
    // (entry points, configs, files whose names match the request); everything else stays one pothub-read or pothub-search away.
    const overview = [];
    if (!direct.length && !carried.length && !auto.length && !opts?.searchResult && opts?.overview !== false) {
      const sizes = sizesOf(repo, branch), taken = new Set();
      let chars = 0;
      for (const p of rankOverviewFiles(paths, sizes, text)) {
        if (taken.size + overview.length >= (opts?.overviewFiles || 14)) break;
        if (taken.has(p)) continue;
        const size = Number(sizes[p]) || 0;
        if (size > 60000 || chars + size > 150000) continue;
        overview.push(p); chars += size;
      }
    }
    const wanted = [...new Set([...direct, ...carried, ...auto, ...overview])], attachments = [], attached = [], failed = [];
    const bundle = await readBundle(repo, branch, wanted, { concurrency: 8 });
    attachments.push(...bundle.attachments); attached.push(...bundle.attached); failed.push(...bundle.failed);
    const note = repoContextNote(repo, branch, attached, paths.length ? repoTreeSummary(paths) : null, auto.filter((p) => attached.includes(p)), opts?.pin || null, carried.filter((p) => attached.includes(p)), overview.filter((p) => attached.includes(p))) + (failed.length ? `\nThese files could not be attached: ${failed.join('; ')}.` : '');
    const extra = opts?.searchResult ? [{ id: 'repo:search', name: 'search-results.txt', type: 'text/plain', size: String(opts.searchResult).length, textContent: String(opts.searchResult).slice(0, 24000) }] : [];
    return [{ id: 'repo:context', name: 'repo-context.md', type: 'text/markdown', size: note.length, textContent: note }, ...extra, ...attachments];
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

  return { list, read, attachmentsFor, readRequested, searchRequested, syncToTermux, forgetSync };
}
