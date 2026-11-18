import { strFromU8, unzipSync } from 'fflate';

export type AttachKind = 'image' | 'video' | 'audio' | 'pdf' | 'docx' | 'text';
/** A file the person added with the + button. The bytes stay on the device until a request needs them. */
export interface Attachment { id: string; name: string; mime: string; size: number; kind: AttachKind; blob: Blob; }
/** What is kept in the saved chat (no bytes). */
export interface AttachmentMeta { name: string; kind: AttachKind; size: number; }

export const MAX_FILES = 6;
export const MAX_TOTAL = 24 * 1_048_576; // base64 inflates by a third, and providers cap requests
const MAX_TEXT_CHARS = 150_000;

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'env', 'log', 'html', 'htm', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'php', 'java', 'kt', 'kts', 'swift', 'go', 'rs', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'zsh', 'ps1', 'sql', 'r', 'lua', 'dart', 'vue', 'svelte', 'tex', 'srt', 'vtt', 'rtf', 'gradle', 'properties', 'conf', 'cfg']);
const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

export function classify(f: { name: string; type: string }): AttachKind | null {
  const t = f.type.toLowerCase(); const e = extOf(f.name);
  if (t.startsWith('image/') && t !== 'image/svg+xml') return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t === 'application/pdf' || e === 'pdf') return 'pdf';
  if (e === 'docx' || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (t.startsWith('text/') || t === 'application/json' || t === 'application/xml' || t === 'image/svg+xml' || TEXT_EXT.has(e)) return 'text';
  return null;
}

export const kindLabel: Record<AttachKind, string> = { image: 'photo', video: 'video', audio: 'audio', pdf: 'PDF', docx: 'Word document', text: 'file' };

/** Turns picked files into attachments. Files that cannot be used come back in `skipped` with a friendly reason. */
export function toAttachments(files: File[], have: Attachment[]): { added: Attachment[]; skipped: string[] } {
  const added: Attachment[] = []; const skipped: string[] = [];
  let total = have.reduce((n, a) => n + a.size, 0);
  for (const f of files) {
    const kind = classify(f);
    if (!kind) { skipped.push(`${f.name} is a type of file I cannot read yet`); continue; }
    if (have.length + added.length >= MAX_FILES) { skipped.push(`${f.name} was left out (up to ${MAX_FILES} files per message)`); continue; }
    if (f.size === 0) { skipped.push(`${f.name} is empty`); continue; }
    if (total + f.size > MAX_TOTAL) { skipped.push(`${f.name} is too large to add (${Math.round(MAX_TOTAL / 1_048_576)} MB per message)`); continue; }
    total += f.size;
    added.push({ id: crypto.randomUUID(), name: f.name || 'file', mime: f.type || 'application/octet-stream', size: f.size, kind, blob: f });
  }
  return { added, skipped };
}

export const meta = (a: Attachment): AttachmentMeta => ({ name: a.name, kind: a.kind, size: a.size });

/** Readable text for files a text model cannot take natively (plain text, code, Word). PDFs, images, audio and video go to the provider as they are. */
export async function textOf(a: Attachment): Promise<string> {
  if (a.kind === 'text') { const t = await a.blob.text(); return t.length > MAX_TEXT_CHARS ? `${t.slice(0, MAX_TEXT_CHARS)}\n…[file continues; the rest was left out to fit]` : t; }
  if (a.kind === 'docx') {
    try {
      const xml = strFromU8(unzipSync(new Uint8Array(await a.blob.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' })['word/document.xml'] ?? new Uint8Array());
      const text = xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error('empty');
      return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…[document continues; the rest was left out to fit]` : text;
    } catch { throw new Error(`I could not open ${a.name}. Save it again as a .docx or PDF and re-attach it.`); }
  }
  return '';
}

export async function base64Of(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export const sizeLabel = (n: number) => (n < 1_048_576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1_048_576).toFixed(1)} MB`);
