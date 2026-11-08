// Lets an agent read ANY file inside a zip the user attached, without the user tagging files.
// The first message carries a path listing plus as many file contents as fit the size budget. When
// files were left out, the agent replies with a ```pothub-read block (same protocol as repository
// chats) and PotHub sends those files back automatically.
import { extractReadRequests } from './repo-mentions.js';

export const ZIP_MAX_FILE_CHARS = 60000;
export const ZIP_MAX_TOTAL_CHARS = 220000;
export const ZIP_MAX_ROUNDS = 8;

const SKIP_DIR = /(?:^|\/)(?:\.git|node_modules|dist|build|\.next|__MACOSX)\//;
const TEXT = /\.(?:txt|md|mdx|csv|json|jsx?|tsx?|mjs|cjs|html?|css|scss|xml|ya?ml|toml|sh|py|java|kt|go|rs|sql|log|vue|svelte|rb|php|c|h|cpp|cs|gradle|properties|env\.example)$|(?:^|\/)(?:Dockerfile|Makefile)$/i;

/** Sentence appended to the zip text when some files did not fit, so the agent knows how to get them. */
export const ZIP_READ_HINT = 'To read any of the files not included, reply with ONE fenced block and nothing else after it:\n```pothub-read\npath/one.js\nfolder/\n```\nOne real path from the list above per line; a line ending in "/" reads that whole folder. PotHub sends the full contents back automatically and you continue. Never ask the user to attach or tag these files, and never describe a file you have not read.';

const cleanEntry = (name) => String(name || '').replace(/^\/+/, '');

/** Readable (text/source) file paths inside the zip, same filtering the first message uses. */
export async function listZipPaths(blob) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(blob);
  const paths = Object.keys(zip.files)
    .filter((k) => !zip.files[k].dir && !k.startsWith('/') && !k.split('/').some((p) => p === '..' || p === '.'))
    .map(cleanEntry)
    .filter((k) => !SKIP_DIR.test(k));
  return { zip, paths, readable: paths.filter((k) => TEXT.test(k) && !/(?:^|\/)package-lock\.json$|\.lock$|\.min\.(?:js|css)$/i.test(k)) };
}

/** Which paths the agent asked for in its reply, limited to real files of this zip. */
export function zipReadRequests(replyText, readablePaths) {
  if (!/```pothub-read/i.test(String(replyText || ''))) return [];
  return extractReadRequests(replyText, readablePaths);
}

/** Full contents of the requested files as attachment rows, plus a short outline so the agent keeps the file list. */
export async function readZipAttachments(blob, requested, zipName = 'archive.zip') {
  const { zip, paths, readable } = await listZipPaths(blob);
  const wanted = (requested || []).filter((p) => readable.includes(p));
  const rows = [];
  let used = 0;
  const left = [];
  for (const p of wanted) {
    const entry = zip.file(p);
    if (!entry) continue;
    const room = ZIP_MAX_TOTAL_CHARS - used;
    if (room < 500) { left.push(p); continue; }
    const content = await entry.async('text');
    const cut = content.slice(0, Math.min(ZIP_MAX_FILE_CHARS, room));
    const note = cut.length < content.length ? `\n[PotHub cut this file after ${cut.length} of ${content.length} characters. Ask for it again alone to continue.]` : '';
    used += cut.length;
    rows.push({ id: `zip-${zipName}-${p}`.slice(0, 100), name: p.slice(-180), type: 'text/plain', size: content.length, textContent: `--- ${p} (from ${zipName}) ---\n${cut}${note}` });
  }
  const outline = `${zipName}: ${paths.length} files. Every path in the archive:\n${paths.slice(0, 800).join('\n')}${paths.length > 800 ? `\n(+${paths.length - 800} more paths)` : ''}${left.length ? `\n\nThese requested files did not fit this round, ask for them again: ${left.join(', ')}` : ''}`;
  rows.unshift({ id: `zip-outline-${zipName}`.slice(0, 100), name: 'zip-outline.txt', type: 'text/plain', size: outline.length, textContent: outline });
  return { rows, count: rows.length - 1 };
}
