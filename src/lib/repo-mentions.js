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

/** Instruction attachment that tells the model what this chat is and what it can and cannot see. */
export function repoContextNote(repo, branch, attachedPaths) {
  return [
    `This conversation is about the GitHub repository ${repo}${branch ? ` (branch ${branch})` : ''}.`,
    attachedPaths.length
      ? `The user attached these files with @: ${attachedPaths.join(', ')}. Their contents follow in separate attachments.`
      : 'No files were attached with @ in this message.',
    'You can only see files that are attached. If you need another file, ask the user to mention it with @path. Do not claim to have read files that are not attached, and say so plainly when you are unsure.',
  ].join('\n');
}
