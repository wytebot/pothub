/** Pure helpers for "@file" mentions in repository chats. No DOM, no network. */

export const MAX_MENTIONED_FILES = 12;
export const MAX_FILE_CHARS = 80000;
export const MAX_TOTAL_CHARS = 300000;

/** The @token being typed right before the caret, or null. Mentions start at the beginning of the text or after whitespace/"(". */
export function activeMention(text, caret = String(text || '').length) {
  const before = String(text || '').slice(0, Math.max(0, caret));
  const m = /(^|[\s(])@([^\s@]{0,160})$/.exec(before);
  return m ? { start: before.length - m[2].length - 1, query: m[2] } : null;
}

const base = (p) => p.slice(p.lastIndexOf('/') + 1);
function subsequence(needle, hay) {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/** Rank repository paths for a query. Best first; stable and deterministic. */
export function rankFiles(files, query, limit = 8) {
  const q = String(query || '').toLowerCase().replace(/^\.?\//, '');
  const rows = [];
  for (const file of files || []) {
    const path = typeof file === 'string' ? file : file?.path;
    if (!path) continue;
    const lower = path.toLowerCase(), name = base(lower);
    let score;
    if (!q) score = 1000 - lower.split('/').length * 10 - Math.min(lower.length, 90) / 100;
    else if (name === q) score = 100;
    else if (name.startsWith(q)) score = 90;
    else if (lower.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 70;
    else if (lower.includes(q)) score = 60;
    else if (subsequence(q, name)) score = 40;
    else if (subsequence(q, lower)) score = 20;
    else continue;
    rows.push({ path, name: base(path), dir: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', score: score - lower.length / 1000 });
  }
  rows.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return rows.slice(0, limit);
}

/** Replace the @token being typed with "@path " and return the new text and caret. */
export function applyMention(text, caret, mention, path) {
  const t = String(text || ''), end = Math.max(caret, mention.start + 1);
  const insert = `@${path} `;
  return { text: t.slice(0, mention.start) + insert + t.slice(end), caret: mention.start + insert.length };
}

/** Paths in the text that are real files of the repo, in order, de-duplicated and capped. */
export function extractMentionedPaths(text, knownPaths, max = MAX_MENTIONED_FILES) {
  const known = knownPaths instanceof Set ? knownPaths : new Set(knownPaths || []);
  const found = [];
  for (const m of String(text || '').matchAll(/(^|[\s(])@([^\s@]+)/g)) {
    let token = m[2];
    while (token && !known.has(token) && /[.,;:!?)\]}'"]$/.test(token)) token = token.slice(0, -1);
    if (known.has(token) && !found.includes(token)) found.push(token);
    if (found.length >= max) break;
  }
  return found;
}

export function truncateForContext(content, max = MAX_FILE_CHARS) {
  const s = String(content ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}\n\n[PotHub truncated this file at ${max} characters.]`;
}

const NOISE = /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.vercel)(\/|$)|\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|mp4|webm|zip|lock)$|(^|\/)package-lock\.json$/i;
export const MAX_TREE_CHARS = 60000;
export const MAX_AUTO_FILES = 8;

/**
 * Plain-text outline of the repository (one line per folder, files listed under it) so the model knows which files
 * exist without reading them. Noise (images, lockfiles, build output) is dropped. When the full listing is bigger than
 * the budget, the remaining folders are still listed with their file counts, so every folder stays reachable with a
 * pothub-read request for "folder/".
 */
export function repoTreeSummary(paths, maxChars = MAX_TREE_CHARS) {
  const useful = [...new Set((paths || []).map((p) => (typeof p === 'string' ? p : p?.path)).filter((p) => p && !NOISE.test(p)))].sort();
  const dirs = new Map();
  for (const p of useful) {
    const i = p.lastIndexOf('/'), dir = i < 0 ? '.' : p.slice(0, i);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(p.slice(i + 1));
  }
  const lines = [];
  let used = 0, shown = 0, folded = 0;
  for (const [dir, names] of dirs) {
    const full = `${dir}/: ${names.join(', ')}`;
    const line = used + full.length + 1 <= maxChars ? full : `${dir}/: ${names.length} files (request "${dir}/" to read them)`;
    if (line !== full) folded += names.length; else shown += names.length;
    if (used + line.length + 1 > maxChars * 2) { lines.push(`(more folders not listed; use pothub-search to find files in them)`); break; }
    lines.push(line); used += line.length + 1;
  }
  const omitted = Math.max(0, useful.length - shown - folded);
  // a folder cut off above leaves its files uncounted, so they show in `omitted`
  if (folded) lines.push(`(${folded} files are in folders listed by count only; request the folder, for example "src/ui/", to read them)`);
  if (omitted > 0) lines.push(`(${omitted} more files not listed; request their folder or search for them)`);
  return { text: lines.join('\n'), total: useful.length, omitted };
}

/**
 * Files the message points at: @mentions first, then bare repository paths such as "src/ui/App.jsx" or
 * "server/app.js:328" pasted from logs and stack traces. Only paths that really exist in the repo are returned.
 */
export function extractReferencedPaths(text, knownPaths, max = MAX_MENTIONED_FILES) {
  const known = knownPaths instanceof Set ? knownPaths : new Set(knownPaths || []);
  const found = extractMentionedPaths(text, known, max);
  for (const m of String(text || '').matchAll(/(?:^|[\s(`'"\[])([A-Za-z0-9_.\-@/]+\.[A-Za-z0-9]{1,8})(?::\d+(?::\d+)?)?(?=$|[\s)`'",.;:!?\]])/g)) {
    if (found.length >= max) break;
    const token = m[1].replace(/^\.?\//, '');
    if (known.has(token) && !found.includes(token)) found.push(token);
  }
  return found;
}

/**
 * Files named by bare file name, e.g. "show me firebase.js" or "what does App.jsx do". A name that matches a few
 * files in the repository attaches all of them (up to 3); a name that matches many is too ambiguous and attaches none.
 */
export function extractNamedPaths(text, knownPaths, max = MAX_MENTIONED_FILES) {
  const paths = Array.isArray(knownPaths) ? knownPaths : [...(knownPaths || [])];
  const byName = new Map();
  for (const p of paths) { const n = base(p).toLowerCase(); if (!byName.has(n)) byName.set(n, []); byName.get(n).push(p); }
  const found = [];
  for (const m of String(text || '').matchAll(/(?:^|[\s(`'"\[@])([A-Za-z0-9_.\-]+\.[A-Za-z0-9]{1,8})(?::\d+(?::\d+)?)?(?=$|[\s)`'",.;:!?\]])/g)) {
    if (found.length >= max) break;
    const hits = byName.get(m[1].toLowerCase());
    if (!hits || hits.length > 3) continue;
    for (const hit of hits) if (!found.includes(hit) && found.length < max) found.push(hit);
  }
  return found;
}

export const MAX_CARRIED_FILES = 8;

/**
 * Files discussed earlier in this chat (newest first), so a follow-up such as "yes, go ahead" or "fix it" still gets
 * the code the conversation is about instead of only the outline. `history` is [{ role, content }].
 */
export function extractCarriedPaths(history, knownPaths, max = MAX_CARRIED_FILES) {
  const found = [];
  for (const m of [...(history || [])].reverse().slice(0, 8)) {
    const text = String(m?.content ?? m?.text ?? '');
    for (const p of [...extractReferencedPaths(text, knownPaths), ...extractNamedPaths(text, knownPaths)]) {
      if (!found.includes(p)) found.push(p);
      if (found.length >= max) return found;
    }
  }
  return found;
}

const STOP = new Set('this that with from have what when where which there their about would could should please make does doesnt dont cant cannot into your file files code repo fix bug error issue work works working show tell help need want just like some more also then them they will the and for not you are can why how its was has had but all any'.split(' '));

/** Best-guess files for a message that names none: path/word overlap only, so a wrong guess is cheap and clearly labelled. */
export function suggestFilesForText(text, paths, limit = MAX_AUTO_FILES) {
  const words = [...new Set(String(text || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [])].filter((w) => !STOP.has(w)).slice(0, 12);
  if (!words.length) return [];
  const rows = [];
  for (const p of paths || []) {
    if (NOISE.test(p) || !/\.(jsx?|tsx?|mjs|cjs|json|css|md|html|py|go|rs|java|kt|swift|sh|ya?ml)$/i.test(p)) continue;
    const lower = p.toLowerCase(), name = base(lower);
    let score = 0;
    for (const w of words) { if (name.includes(w)) score += 3; else if (lower.includes(w)) score += 1; }
    if (score >= 3) rows.push({ p, score: score - lower.length / 1000 });
  }
  rows.sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));
  return rows.slice(0, limit).map((r) => r.p);
}

/** How an agent reads any repository file that was not attached: it asks, PotHub fetches the file and sends it back. */
export const MAX_READ_REQUEST = 20;
export const MAX_SEARCH_TERMS = 6;
export const READ_PROTOCOL = `You can read ANY file in this repository, not only the attached ones, and the user never has to tag files for you. Work like a developer opening the project:\n1. Read the files attached to this message first.\n2. If you need more code, reply with ONE fenced block and nothing else after it. To read files or whole folders:\n\`\`\`pothub-read\nsrc/lib/firebase.js\nserver/\n\`\`\`\nUse real paths from the outline, one per line; a line ending in "/" reads that whole folder (at most ${MAX_READ_REQUEST} files per request).\n3. To find where something is used or defined across ALL files (function names, error text, env variable names, routes), search instead:\n\`\`\`pothub-search\nINVALID_REPOSITORY_PATH\nnormalizeRepoPath\n\`\`\`\nOne term per line, at most ${MAX_SEARCH_TERMS}. PotHub searches every readable file and sends back path:line matches, then you read the files that matter.\nPotHub sends the results back automatically and you continue. For a question about the code, a bug, an audit or a fix, do not answer from the outline alone and do not ask the user to tag files: search or read first. Never say you cannot read a file that is in the outline. Do not claim to have read files that are not attached or returned, never describe a file you have not read, and never invent a path.`;

const READ_CLOSED = /```pothub-(?:read|search)[^\n]*\n([\s\S]*?)```/gi;
const READ_ONLY_CLOSED = /```pothub-read[^\n]*\n([\s\S]*?)```/gi;
const SEARCH_CLOSED = /```pothub-search[^\n]*\n([\s\S]*?)```/gi;
const READ_OPEN_TAIL = /```pothub-(?:read|search)[^\n]*\n[\s\S]*$/i;
const READABLE_SOURCE = /\.(jsx?|tsx?|mjs|cjs|json|css|scss|md|mdx|html?|py|go|rs|java|kt|swift|sh|ya?ml|toml|txt|sql|xml|vue|svelte|rb|php|c|h|cpp|hpp|cs|gradle|properties)$/i;
const cleanPath = (raw) => String(raw || '').trim().replace(/^[-*]\s+/, '').replace(/^@/, '').replace(/^\.?\//, '').replace(/[`'"]/g, '').replace(/:\d+(?::\d+)?$/, '');

/** Paths the agent asked to read: real files, plus every readable file under a folder it named. De-duplicated and capped. */
export function extractReadRequests(text, knownPaths, max = MAX_READ_REQUEST) {
  const list = knownPaths instanceof Set ? [...knownPaths] : [...(knownPaths || [])], known = new Set(list);
  const found = [];
  const add = (p) => { if (!found.includes(p)) found.push(p); return found.length >= max; };
  for (const m of String(text || '').matchAll(READ_ONLY_CLOSED)) {
    for (const raw of m[1].split('\n')) {
      const path = cleanPath(raw);
      if (!path) continue;
      if (known.has(path)) { if (add(path)) return found; continue; }
      const dir = path.replace(/\/(?:\*\*?)?$/, '').replace(/\/+$/, '');
      if (!dir || dir === '*' || dir === '**') continue;
      const inside = list.filter((p) => p.startsWith(`${dir}/`) && !NOISE.test(p) && READABLE_SOURCE.test(p)).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
      for (const p of inside) if (add(p)) return found;
    }
  }
  return found;
}

/** Search terms the agent asked for (literal text, one per line). */
export function extractSearchRequests(text, max = MAX_SEARCH_TERMS) {
  const found = [];
  for (const m of String(text || '').matchAll(SEARCH_CLOSED)) {
    for (const raw of m[1].split('\n')) {
      const term = raw.trim().replace(/^[-*]\s+/, '').replace(/^[`'"]+|[`'"]+$/g, '');
      if (term.length >= 2 && term.length <= 80 && !found.includes(term)) found.push(term);
      if (found.length >= max) return found;
    }
  }
  return found;
}
/** Hide pothub-read / pothub-search blocks (finished or still streaming) from the visible reply. */
export const stripReadBlocks = (text) => String(text || '').replace(READ_CLOSED, '').replace(READ_OPEN_TAIL, '').replace(/\n{3,}/g, '\n\n').trim();

/** Source files ranked for a first look at a project when the message names none: entry points and configs first, shallow before deep. */
export function rankOverviewFiles(paths, sizes = {}, text = '') {
  const words = [...new Set(String(text || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [])].filter((w) => !STOP.has(w)).slice(0, 12);
  const rows = [];
  for (const p of paths || []) {
    if (NOISE.test(p) || !READABLE_SOURCE.test(p) || /(^|\/)\.env(\.|$)(?!example)/i.test(p) || /(^|\/)(tests?|__tests__|docs?)\//i.test(p) || /\.(test|spec)\./i.test(p)) continue;
    if (/\.md$/i.test(p) && !/(^|\/)README\.md$/i.test(p)) continue;
    const lower = p.toLowerCase(), name = base(lower), depth = p.split('/').length - 1;
    let score = 0;
    if (/^(package\.json|readme\.md|vercel\.json|next\.config\.m?js|capacitor\.config\.(json|ts))$/.test(lower)) score += 6;
    if (/^(src\/)?(main|index|app)\.(jsx?|tsx?|mjs)$|^(server|api)\/(app|index|server)\.(m?js|ts)$|^src\/ui\/app\.jsx$|^pages\/(_app|index)\./.test(lower)) score += 8;
    for (const w of words) { if (name.includes(w)) score += 5; else if (lower.includes(w)) score += 2; }
    score -= depth * 0.8;
    const size = Number(sizes[p]) || 0;
    score -= Math.min(size, 300000) / 60000;
    rows.push({ p, score, size });
  }
  rows.sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));
  return rows.map((r) => r.p);
}

/** Instruction attachment that tells the model what this chat is, which files exist, and which of them it can actually read. */
export function repoContextNote(repo, branch, attachedPaths, tree = null, autoPaths = [], pin = null, carriedPaths = [], overviewPaths = []) {
  const auto = new Set(autoPaths), carried = new Set(carriedPaths), overview = new Set(overviewPaths);
  const explicit = attachedPaths.filter((p) => !auto.has(p) && !carried.has(p) && !overview.has(p)), guessed = attachedPaths.filter((p) => auto.has(p)), earlier = attachedPaths.filter((p) => carried.has(p)), starter = attachedPaths.filter((p) => overview.has(p) && !auto.has(p));
  return [
    `This conversation is about the GitHub repository ${repo}${branch ? ` (branch ${branch})` : ''}.`,
    tree?.text ? `Repository file outline (${tree.total} files, real paths on this branch; the outline shows names only, not contents):\n${tree.text}` : '',
    explicit.length ? `The user pointed at these files: ${explicit.join(', ')}. Their contents follow in separate attachments.` : (earlier.length ? '' : 'No files were attached with @ or by path in this message.'),
    earlier.length ? `PotHub attached these files again because this conversation was already about them: ${earlier.join(', ')}. Their contents follow in separate attachments; use them.` : '',
    starter.length ? `PotHub attached these key project files so you start with real code: ${starter.join(', ')}. Their contents follow in separate attachments. They are a starting point, not the whole project: read or search for anything else you need before answering.` : '',
    guessed.length ? `PotHub also attached these files because their names match the request: ${guessed.join(', ')}. They are a guess and may not be the right ones.` : '',
    pin?.ready
      ? `ALL FILES PINNED. The complete repository is copied into the user's Termux at ~/.pothub/workspaces/${pin.workspace} (branch ${branch || 'default'}), so you can read every file, not just the attached ones. Use a pothub-run block with "cwd: ~/.pothub/workspaces/${pin.workspace}" to explore: list files, search with rg or grep -rn, read exact line ranges with sed -n 'START,ENDp' FILE, use git ls-files or git grep. Read-only commands run automatically and their output comes back to you; anything that changes files waits for the user's approval. Work from evidence: search, read the real code, then conclude, and never describe a file you have not read. Structure your replies with these headings when you are investigating a problem: ## Understanding, ## Investigation, ## Problem, ## Plan, ## Fix.`
      : pin
        ? `All files are pinned, but the repository could not be copied into Termux (${pin.reason || 'Termux is not available'}). ${READ_PROTOCOL}`
        : READ_PROTOCOL,
  ].filter(Boolean).join('\n');
}

/** The first row of the @ list: one tap pins the whole repository for the agent. */
export const PIN_ALL_ITEM = { path: '*', name: 'Pin all files', dir: 'Agent reads the whole repo with terminal commands', pinAll: true };
export const showPinAll = (query) => !query || /^(a|al|all|p|pi|pin)$/i.test(query);

/** Folder name used for the repo inside Termux: owner/name -> owner__name. */
export const repoWorkspaceName = (repo) => String(repo || '').replace('/', '__').replace(/[^A-Za-z0-9_.-]/g, '_');

const TEXT_FILE = /\.(jsx?|tsx?|mjs|cjs|json|css|scss|less|md|mdx|html?|py|go|rs|java|kt|swift|sh|bash|ya?ml|toml|txt|sql|xml|vue|svelte|rb|php|c|h|cpp|hpp|cs|gradle|properties)$|(^|\/)(Dockerfile|Makefile|LICENSE|\.gitignore|\.env\.example)$/i;
/** Files worth copying into Termux: readable source and config, never images, lockfiles, build output or secrets. */
export const isSyncablePath = (p) => !!p && !NOISE.test(p) && TEXT_FILE.test(p) && !/(^|\/)\.env(\.|$)(?!example)/i.test(p);
