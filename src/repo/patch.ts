// Reading model output into file changes, applying edits exactly, and refusing changes that look broken before anything is committed.
// Free of imports so it is cheap to test.

export interface ParsedFile { path: string; content: string }
export interface EditBlock { search: string; replace: string }

const fence = (s: string) => { const m = s.match(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/); return m ? m[1] : s; };

/** `=== FILE: path ===` … `=== END FILE ===` sections (a missing END marker is accepted for the last one). */
export function parseFiles(text: string): ParsedFile[] {
  const out: ParsedFile[] = [];
  const heads = [...text.matchAll(/^=== FILE: (.+?) ===[ \t]*\r?\n/gm)];
  heads.forEach((h, i) => {
    const start = (h.index ?? 0) + h[0].length;
    const end = i + 1 < heads.length ? (heads[i + 1].index ?? text.length) : text.length;
    let body = text.slice(start, end);
    const stop = body.search(/^=== END FILE ===/m);
    if (stop >= 0) body = body.slice(0, stop);
    out.push({ path: h[1].trim(), content: fence(body.replace(/\s+$/, '')).replace(/\s+$/, '') + '\n' });
  });
  return out;
}

/** `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` blocks. */
export function parseBlocks(text: string): EditBlock[] {
  const out: EditBlock[] = [];
  const re = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n?>>>>>>> REPLACE/g;
  for (const m of text.matchAll(re)) out.push({ search: m[1], replace: m[2] });
  return out;
}

const norm = (s: string) => s.split('\n').map((l) => l.trimEnd()).join('\n');

/** Applies each block once, in order. A block must match exactly one place (tolerating trailing spaces); otherwise nothing is applied. */
export function applyBlocks(original: string, blocks: EditBlock[]): { ok: true; text: string } | { ok: false; error: string } {
  if (!blocks.length) return { ok: false, error: 'The model returned no edit blocks.' };
  let text = original;
  for (const [i, b] of blocks.entries()) {
    if (!b.search.trim()) return { ok: false, error: `Edit ${i + 1} has an empty SEARCH part.` };
    const count = text.split(b.search).length - 1;
    if (count === 1) { text = text.replace(b.search, () => b.replace); continue; }
    if (count > 1) return { ok: false, error: `Edit ${i + 1} matches ${count} places; it must match exactly one.` };
    // Retry ignoring trailing spaces.
    const lines = text.split('\n'); const want = norm(b.search).split('\n'); let at = -1; let hits = 0;
    for (let s = 0; s + want.length <= lines.length; s++) if (want.every((w, k) => lines[s + k].trimEnd() === w)) { at = s; hits++; }
    if (hits !== 1) return { ok: false, error: `Edit ${i + 1} could not be found in the file.` };
    lines.splice(at, want.length, ...b.replace.split('\n')); text = lines.join('\n');
  }
  return { ok: true, text };
}

/** Pulls the machine-readable list of affected files out of an analysis (a ```json block holding {"files":[…]} or a bare array). */
export interface Affected { path: string; action: 'edit' | 'create' | 'delete'; reason: string }
export function parseAffected(text: string): Affected[] {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const raw of blocks.reverse()) {
    try {
      const j = JSON.parse(raw) as unknown;
      const list = Array.isArray(j) ? j : (j as { files?: unknown }).files;
      if (!Array.isArray(list)) continue;
      const out: Affected[] = [];
      for (const x of list) {
        const o = x as { path?: unknown; action?: unknown; reason?: unknown };
        if (typeof o?.path !== 'string' || !o.path.trim()) continue;
        const action = o.action === 'create' || o.action === 'delete' ? o.action : 'edit';
        out.push({ path: o.path.trim().replace(/^\.?\//, ''), action, reason: typeof o.reason === 'string' ? o.reason.slice(0, 240) : '' });
      }
      if (out.length) return out.slice(0, 12);
    } catch { /* try the next block */ }
  }
  return [];
}
/** The analysis without its trailing machine-readable block. */
export const stripAffected = (text: string): string => text.replace(/\n*```json\s*[\s\S]*?```\s*$/i, '').trim();

const PLACEHOLDER = /(?:\/\/|\/\*|#|<!--)\s*(?:\.{3}|…)\s*(?:rest|remaining|existing|unchanged|same|other)|\b(?:rest of (?:the )?(?:file|code|component|function)|existing code|unchanged code|code (?:here|omitted))\b|^\s*(?:\.{3}|…)\s*$/im;
const CODE = /\.(?:tsx?|jsx?|mjs|cjs|css|scss|json)$/i;

/** Brackets must balance outside strings, comments and template literals (a cheap check that catches truncated output). */
export function balanced(src: string): boolean {
  const stack: string[] = []; const pair: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) return false; i = e + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; if (src[i] === '\n') break; i++; } i++; continue; }
    if (c === '`') { i++; let depth = 0; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (depth === 0 && src[i] === '`') break; if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; } if (depth > 0 && src[i] === '}') depth--; i++; } if (i >= n) return false; i++; continue; }
    // A regex literal or JSX text can hold stray quotes and brackets; to stay safe this check ignores lines that look like those.
    if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c)) { if (stack.pop() !== pair[c]) return false; }
    i++;
  }
  return stack.length === 0;
}

export interface Verdict { ok: boolean; problems: string[]; warnings: string[] }
/** Refuses a change that is empty, truncated, a placeholder, invalid JSON, or has unbalanced brackets. */
export function checkChange(path: string, before: string | null, after: string | null, o: { whole: boolean }): Verdict {
  const problems: string[] = []; const warnings: string[] = [];
  if (after === null) return { ok: true, problems, warnings };
  if (!after.trim()) problems.push('the new file is empty');
  if (PLACEHOLDER.test(after) && !(before !== null && PLACEHOLDER.test(before))) problems.push('it contains a placeholder such as "rest of file" instead of real code');
  if (before !== null && o.whole && before.length > 400 && after.length < before.length * 0.4) problems.push(`the new file is ${Math.round(after.length / before.length * 100)}% of the old size, which looks cut off`);
  if (/\.json$/i.test(path)) { try { JSON.parse(after); } catch { problems.push('it is not valid JSON'); } }
  else if (CODE.test(path) && !/\.(?:css|scss)$/i.test(path) && !balanced(after) && (before === null || balanced(before))) problems.push('its brackets do not balance, so the file looks cut off');
  if (before !== null && before === after) warnings.push('the file is unchanged');
  return { ok: problems.length === 0, problems, warnings };
}

/** A compact line diff for the terminal view (added and removed lines with a little context). */
export function miniDiff(before: string, after: string, context = 2, max = 60): string[] {
  const a = before.split('\n'); const b = after.split('\n');
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length - 1; let eb = b.length - 1; while (ea >= s && eb >= s && a[ea] === b[eb]) { ea--; eb--; }
  const out: string[] = [];
  for (let i = Math.max(0, s - context); i < s; i++) out.push(`  ${a[i]}`);
  for (let i = s; i <= ea; i++) out.push(`- ${a[i]}`);
  for (let i = s; i <= eb; i++) out.push(`+ ${b[i]}`);
  for (let i = ea + 1; i < Math.min(a.length, ea + 1 + context); i++) out.push(`  ${a[i]}`);
  return out.length > max ? [...out.slice(0, max), `… ${out.length - max} more lines`] : out;
}
