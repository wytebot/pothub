/** Pure helpers for "@file" mentions in repository chats. No DOM, no network. */

export const MAX_MENTIONED_FILES = 5;
export const MAX_FILE_CHARS = 60000;
export const MAX_TOTAL_CHARS = 150000;

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
export const MAX_TREE_CHARS = 14000;
export const MAX_AUTO_FILES = 3;

/**
 * Plain-text outline of the repository (one line per folder, files listed under it) so the model knows which files
 * exist without reading them. Noise (images, lockfiles, build output) is dropped and the size is bounded.
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
  let used = 0, shown = 0;
  for (const [dir, names] of dirs) {
    const line = `${dir}/: ${names.join(', ')}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line); used += line.length + 1; shown += names.length;
  }
  const omitted = useful.length - shown;
  if (omitted > 0) lines.push(`(${omitted} more files not listed; ask the user to mention them with @path)`);
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

/** Instruction attachment that tells the model what this chat is, which files exist, and which of them it can actually read. */
export function repoContextNote(repo, branch, attachedPaths, tree = null, autoPaths = [], pin = null) {
  const auto = new Set(autoPaths);
  const explicit = attachedPaths.filter((p) => !auto.has(p)), guessed = attachedPaths.filter((p) => auto.has(p));
  return [
    `This conversation is about the GitHub repository ${repo}${branch ? ` (branch ${branch})` : ''}.`,
    tree?.text ? `Repository file outline (${tree.total} files, real paths on this branch; the outline shows names only, not contents):\n${tree.text}` : '',
    explicit.length ? `The user pointed at these files: ${explicit.join(', ')}. Their contents follow in separate attachments.` : 'No files were attached with @ or by path in this message.',
    guessed.length ? `PotHub also attached these files because their names match the request: ${guessed.join(', ')}. They are a guess and may not be the right ones.` : '',
    pin?.ready
      ? `ALL FILES PINNED. The complete repository is copied into the user's Termux at ~/.pothub/workspaces/${pin.workspace} (branch ${branch || 'default'}), so you can read every file, not just the attached ones. Use a pothub-run block with "cwd: ~/.pothub/workspaces/${pin.workspace}" to explore: list files, search with rg or grep -rn, read exact line ranges with sed -n 'START,ENDp' FILE, use git ls-files or git grep. Read-only commands run automatically and their output comes back to you; anything that changes files waits for the user's approval. Work from evidence: search, read the real code, then conclude, and never describe a file you have not read. Structure your replies with these headings when you are investigating a problem: ## Understanding, ## Investigation, ## Problem, ## Plan, ## Fix.`
      : pin
        ? `All files are pinned, but the repository could not be copied into Termux (${pin.reason || 'Termux is not available'}), so you can read only the outline and the attached files. Say so plainly and ask the user to connect Termux if you need more of the code.`
        : 'You can read only the attached files. Use the outline to name the exact files you need and ask the user to mention them with @path. Do not claim to have read files that are not attached, never invent a path that is not in the outline, and say plainly when you are unsure.',
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
