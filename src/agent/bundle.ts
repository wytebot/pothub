import { strToU8 } from 'fflate';
import { markdownToDocx, markdownToPdf } from './deliver';
import { csvToXlsx, markdownToPptx, safePath, zipEntries, type ZipEntry } from './office';
import { cleanName, slugName } from './fileNames';

/**
 * Multi-file answers. The text model is asked to write every file between markers, so a whole project (or a set of mixed
 * documents) can come back as ONE zip:
 *
 *   === FILE: src/App.tsx ===
 *   ...the file...
 *   === END FILE ===
 *
 * Files named .pdf / .docx / .pptx are written as Markdown and .xlsx as CSV; Pothub turns them into the real format.
 */
export interface BundleFile { path: string; content: string; }

export { BUNDLE_PROTOCOL } from './protocol';

const START = /^\s*={3,}\s*FILE\s*:\s*(.+?)\s*={0,}\s*$/i;
const END = /^\s*={3,}\s*END(?:\s+FILE)?\s*={0,}\s*$/i;
const unfence = (s: string) => {
  const lines = s.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift(); while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length >= 2 && /^\s*(```|~~~)/.test(lines[0]) && /^\s*(```|~~~)\s*$/.test(lines[lines.length - 1])) return lines.slice(1, -1).join('\n');
  return lines.join('\n');
};

/** A line that names a file right before a code block ("**src/App.tsx**", "### `server.js`", "File: index.html"). */
const NAMED = /^\s*(?:#{1,6}\s*|\*\*|__|-\s+)?(?:file(?:name)?\s*:\s*)?[`*_]*([\w@.\-/]+\.[A-Za-z0-9]{1,8})[`*_:]*\s*(?:\*\*|__)?\s*:?\s*$/i;

/** Reads the marked files out of an answer. Falls back to "file name, then code block" layouts that models often use instead. */
export function parseBundle(reply: string): BundleFile[] {
  const lines = reply.replace(/\r\n?/g, '\n').split('\n'); const out: BundleFile[] = [];
  let name = ''; let buf: string[] = [];
  const close = () => { if (name) { const p = safePath(name.replace(/^[`'"]+|[`'"]+$/g, '')); if (p) out.push({ path: p, content: unfence(buf.join('\n')) }); } name = ''; buf = []; };
  for (const l of lines) {
    const s = l.match(START);
    if (s) { close(); name = s[1]; continue; }
    if (name && END.test(l)) { close(); continue; }
    if (name) buf.push(l);
  }
  close();
  if (out.length) return out;
  // fallback: a file name line followed by a fenced block
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(NAMED); const fence = lines[i + 1]?.match(/^\s*(```|~~~)/);
    if (!m || !fence) continue;
    const body: string[] = []; let j = i + 2; while (j < lines.length && !lines[j].trim().startsWith(fence[1])) body.push(lines[j++]);
    const p = safePath(m[1]); if (p) out.push({ path: p, content: body.join('\n') });
    i = j;
  }
  if (out.length) return out;
  if (out.length) return out;
  // fallback: a fence whose info string carries a path ("```tsx title=src/App.tsx" or "```js:server.js")
  const re = /(```|~~~)[\w+#-]*(?:[: ]\s*(?:title=|file=|filename=)?["']?([\w@.\-/]+\.[A-Za-z0-9]{1,8})["']?)\s*\n([\s\S]*?)\n\1/g;
  for (let m: RegExpExecArray | null; (m = re.exec(reply));) { const p = safePath(m[2]); if (p) out.push({ path: p, content: m[3] }); }
  // Fallback for a single-file response that contains fenced source but omits file markers.
  // Use a conservative extension map and never treat shell packaging instructions as project source.
  const fenced = [...reply.matchAll(/```([\w+#.-]*)\s*\n([\s\S]*?)\n```/g)];
  if (fenced.length) {
    const extFor = (lang: string) => ({ typescript: 'ts', ts: 'ts', tsx: 'tsx', javascript: 'js', js: 'js', jsx: 'jsx', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', yaml: 'yml', sql: 'sql', bash: 'sh', shell: 'sh', sh: 'sh', markdown: 'md', md: 'md' } as Record<string, string>)[lang.toLowerCase()] ?? 'txt';
    for (const [i, m] of fenced.entries()) {
      const lang = m[1] || 'text'; const body = m[2];
      if (/\b(?:execSync|Compress-Archive|zip -r|powershell -Command)\b/i.test(body) && /\b(?:packaging project|zip generation|zip archive)\b/i.test(reply)) continue;
      out.push({ path: fenced.length === 1 ? `generated-file.${extFor(lang)}` : `generated/file-${i + 1}.${extFor(lang)}`, content: body });
    }
    if (out.length) return out;
  }
  return out;
}

/** Plain-language summary of what a bundle holds, used in the chat reply. */
export const bundleSummary = (files: { path: string }[]) => {
  const n = files.length; const names = files.slice(0, 4).map((f) => f.path.split('/').pop()).join(', ');
  return `${n} file${n === 1 ? '' : 's'}: ${names}${n > 4 ? `, and ${n - 4} more` : ''}`;
};

async function toBytes(f: BundleFile, notes: string[]): Promise<Uint8Array> {
  const ext = (f.path.split('.').pop() ?? '').toLowerCase();
  const buf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  try {
    if (ext === 'pdf') return await buf(await markdownToPdf(f.content));
    if (ext === 'docx') return await buf(markdownToDocx(f.content));
    if (ext === 'pptx') return await buf(markdownToPptx(f.content));
    if (ext === 'xlsx') return await buf(csvToXlsx(f.content));
  } catch { notes.push(`${f.path} could not be converted, so it was saved as plain text.`); }
  return strToU8(f.content.endsWith('\n') ? f.content : `${f.content}\n`);
}

/** Builds the zip for a model answer. `name` says what the zip contains ("pothub auth-ui fixed"): it names the file and the folder inside. Returns null when the answer holds no files. */
export async function buildBundle(reply: string, name: string, extra: ZipEntry[] = []): Promise<{ blob: Blob; name: string; files: BundleFile[]; notes: string[] } | null> {
  let files = parseBundle(reply); const notes: string[] = [];
  if (!files.length) {
    const text = reply.trim(); if (!text) return null;
    const looksLikePackagingScript = /(?:execSync\s*\(|Compress-Archive|zip\s+-r|powershell\s+-Command)/i.test(text) && /(?:packaging project|zip generation|zip archive|node_modules|DestinationPath)/i.test(text);
    const safeFallback = looksLikePackagingScript
      ? '# ZIP generation needs project files\n\nThe model returned a packaging command instead of the requested project files. Retry the request with the project attached and ask Pothub to return complete files using its ZIP file format.\n'
      : text;
    files = [{ path: looksLikePackagingScript ? 'README.md' : `${slugName(name) || 'pothub-answer'}.md`, content: safeFallback }];
    notes.push(looksLikePackagingScript ? 'The model returned a ZIP packaging script instead of the project files. The archive contains a recovery note; retry with the source project attached.' : `The answer was a single document, so the zip holds it as ${files[0].path}.`);
  }
  const entries: ZipEntry[] = [];
  for (const f of files) entries.push({ path: f.path, data: await toBytes(f, notes) });
  const own = new Set(entries.map((e) => e.path));
  for (const x of extra) if (!own.has(safePath(x.path))) entries.push(x);
  // one top-level folder keeps an extracted archive tidy: only added when files do not already share one
  const top = new Set(entries.map((e) => safePath(e.path).split('/')[0])); const shared = entries.length > 1 && top.size === 1 && entries.every((e) => safePath(e.path).includes('/'));
  const base = slugName(name) || 'pothub-files'; const label = cleanName(name) || 'Pothub files';
  const blob = zipEntries(shared || entries.length === 1 ? entries : entries.map((e) => ({ ...e, path: `${base}/${e.path}` })));
  return { blob, name: `${label}.zip`, files, notes };
}
