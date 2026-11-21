import { strFromU8, unzipSync } from 'fflate';

export type AttachKind = 'image' | 'video' | 'audio' | 'pdf' | 'docx' | 'text' | 'office' | 'archive' | 'binary';
/** A file the person added with the + button. The bytes stay on the device until a request needs them. */
export interface Attachment { id: string; name: string; mime: string; size: number; kind: AttachKind; blob: Blob; }
/** What is kept in the saved chat (no bytes). */
export interface AttachmentMeta { name: string; kind: AttachKind; size: number; }

// The per-message picker cap is separate from the local 20-file analysis allowance enforced by fileQuota.ts.
export const MAX_FILES = 20;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_BATCH_BYTES = 60 * 1024 * 1024; // 60 MB per message batch

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'env', 'log', 'html', 'htm', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'php', 'java', 'kt', 'kts', 'swift', 'go', 'rs', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'zsh', 'ps1', 'sql', 'r', 'lua', 'dart', 'vue', 'svelte', 'tex', 'srt', 'vtt', 'rtf', 'gradle', 'properties', 'conf', 'cfg']);
const OFFICE_EXT = new Set(['xlsx', 'xlsm', 'pptx', 'odt', 'ods', 'odp', 'epub', 'rtf']);
const ARCHIVE_EXT = new Set(['zip', 'jar', 'war', 'apk', 'tar', 'gz', 'tgz', 'gzip', '7z', 'rar', 'bz2', 'xz', 'zst']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus']);
const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

export function classify(f: { name: string; type: string }): AttachKind {
  const t = f.type.toLowerCase(); const e = extOf(f.name);
  if (t.startsWith('image/') && t !== 'image/svg+xml') return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (!t || t === 'application/octet-stream') { if (IMAGE_EXT.has(e)) return 'image'; if (VIDEO_EXT.has(e)) return 'video'; if (AUDIO_EXT.has(e)) return 'audio'; } // some pickers give no file type: go by the name
  if (t === 'application/pdf' || e === 'pdf') return 'pdf';
  if (e === 'docx' || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (t.startsWith('text/') || t === 'application/json' || t === 'application/xml' || t === 'image/svg+xml' || TEXT_EXT.has(e) || e === 'ipynb') return 'text';
  if (OFFICE_EXT.has(e)) return 'office';
  if (ARCHIVE_EXT.has(e) || /zip|x-tar|gzip|x-7z|rar/.test(t)) return 'archive';
  return 'binary'; // anything else is still read: the readable text inside it is recovered
}

export const kindLabel: Record<AttachKind, string> = { image: 'photo', video: 'video', audio: 'audio', pdf: 'PDF', docx: 'Word document', text: 'file', office: 'document', archive: 'archive', binary: 'file' };

/** Turns picked files into attachments. Files that cannot be used come back in `skipped` with a friendly reason. */
export function toAttachments(files: File[], have: Attachment[]): { added: Attachment[]; skipped: string[] } {
  const added: Attachment[] = []; const skipped: string[] = [];
  let batchBytes = have.reduce((n, a) => n + a.size, 0);
  for (const f of files) {
    if (have.length + added.length >= MAX_FILES) { skipped.push(`${f.name}: maximum ${MAX_FILES} files per message`); continue; }
    if (f.size > MAX_ATTACHMENT_BYTES) { skipped.push(`${f.name}: exceeds the 25 MB per-file limit`); continue; }
    if (batchBytes + f.size > MAX_BATCH_BYTES) { skipped.push(`${f.name}: message attachments cannot exceed 60 MB total`); continue; }
    const kind = classify(f);
    if (['image', 'video', 'audio'].includes(kind)) { skipped.push(`${f.name}: media files are not supported in this text-only app`); continue; }
    if (f.size === 0) { skipped.push(`${f.name} is empty`); continue; }

    added.push({ id: crypto.randomUUID(), name: f.name || 'file', mime: f.type || 'application/octet-stream', size: f.size, kind, blob: f }); batchBytes += f.size;
  }
  return { added, skipped };
}

export const meta = (a: Attachment): AttachmentMeta => ({ name: a.name, kind: a.kind, size: a.size });

/** Readable text for files a text model cannot take natively (plain text, code, Word). PDFs, images, audio and video go to the provider as they are. */
export async function textOf(a: Attachment): Promise<string> {
  if (a.kind === 'text') return a.blob.text();
  if (a.kind === 'docx') {
    try {
      const xml = strFromU8(unzipSync(new Uint8Array(await a.blob.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' })['word/document.xml'] ?? new Uint8Array());
      const text = xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error('empty');
      return text;
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
