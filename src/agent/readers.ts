import { gunzipSync, strFromU8, unzipSync } from 'fflate';
import { classify, sizeLabel, textOf, type Attachment } from './attachments';

/**
 * Makes every kind of file readable BEFORE any provider is involved: documents, spreadsheets, slides, e-books,
 * archives, notebooks and even unknown binaries are turned into plain text on this device, so any text model can read them.
 * Media is rejected by the attachment pipeline. Documents are converted to text locally before they are sent to a text model.
 */

const ext = (n: string) => (n.split('.').pop() ?? '').toLowerCase();
const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);
const dec = (u: Uint8Array) => new TextDecoder('utf-8').decode(u);
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const tagsOf = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

export interface Readable { text: string; notes: string[]; }

// ---------------------------------------------------------------- office formats (all are zip files of XML)
const colIndex = (ref: string) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? 'A') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export function xlsxText(f: Record<string, Uint8Array>): string {
  const u = (n: string) => (f[n] ? strFromU8(f[n]) : '');
  const shared = tagsOf(u('xl/sharedStrings.xml'), 'si').map((si) => unesc(tagsOf(si, 't').join('')));
  const target = new Map<string, string>();
  for (const m of u('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], 'Id'); const t = attr(m[0], 'Target'); if (id && t) { const x = t.replace(/^\//, ''); target.set(id, x.startsWith('xl/') ? x : `xl/${x}`); } }
  const out: string[] = [];
  for (const s of u('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc(attr(s[0], 'name') ?? 'Sheet'); const path = target.get(/r:id="([^"]*)"/.exec(s[0])?.[1] ?? '') ?? ''; const xml = u(path);
    const rows: string[] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const t = attr(c[1], 't'); const ref = attr(c[1], 'r') ?? ''; const inner = c[2] ?? ''; const v = tagsOf(inner, 'v')[0] ?? '';
        const val = t === 's' ? (shared[Number(v)] ?? '') : t === 'inlineStr' ? unesc(tagsOf(inner, 't').join('')) : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : unesc(v);
        cells[ref ? colIndex(ref) : cells.length] = val;
      }
      rows.push(Array.from(cells, (x) => x ?? '').join('\t').replace(/\s+$/, ''));
    }
    out.push(`## Sheet: ${name}\n${rows.join('\n')}`);
  }
  return out.join('\n\n');
}

export function pptxText(f: Record<string, Uint8Array>): string {
  const paras = (xml: string) => tagsOf(xml, 'a:p').map((p) => unesc([...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join(''))).filter(Boolean).join('\n');
  const slides = Object.keys(f).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  return slides.map((n, i) => {
    const notes = f[`ppt/notesSlides/notesSlide${num(n)}.xml`]; const nt = notes ? paras(strFromU8(notes)) : '';
    return `--- Slide ${i + 1} ---\n${paras(strFromU8(f[n]))}${nt ? `\n[Speaker notes]\n${nt}` : ''}`;
  }).join('\n\n');
}

export function odfText(f: Record<string, Uint8Array>): string {
  const xml = f['content.xml'] ? strFromU8(f['content.xml']) : '';
  return unesc(xml.replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<text:s\/>/g, ' ').replace(/<draw:page\b[^>]*>/g, '\n--- Slide ---\n').replace(/<\/text:(p|h)>/g, '\n').replace(/<\/table:table-cell>/g, '\t').replace(/<\/table:table-row>/g, '\n').replace(/<table:table\b[^>]*table:name="([^"]*)"[^>]*>/g, '\n## Sheet: $1\n').replace(/<[^>]+>/g, ''))
    .replace(/\t+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const htmlText = (h: string) => unesc(h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export function epubText(f: Record<string, Uint8Array>): string {
  const u = (n: string) => (f[n] ? strFromU8(f[n]) : '');
  const opfPath = attr(/<rootfile\b[^>]*>/.exec(u('META-INF/container.xml'))?.[0] ?? '', 'full-path') ?? Object.keys(f).find((n) => n.endsWith('.opf')) ?? '';
  const opf = u(opfPath); const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const href = new Map<string, string>(); for (const m of opf.matchAll(/<item\b[^>]*>/g)) { const id = attr(m[0], 'id'); const h = attr(m[0], 'href'); if (id && h) href.set(id, base + decodeURIComponent(h)); }
  let order = [...opf.matchAll(/<itemref\b[^>]*>/g)].map((m) => href.get(attr(m[0], 'idref') ?? '') ?? '').filter(Boolean);
  if (!order.length) order = Object.keys(f).filter((n) => /\.(x?html?)$/i.test(n)).sort();
  return order.filter((n) => f[n]).map((n) => htmlText(strFromU8(f[n]))).filter(Boolean).join('\n\n');
}

export function rtfText(src: string): string {
  // drop groups that hold no body text (fonts, colours, styles, pictures, hidden destinations)
  let s = src; const drop = /\{\\(\*|fonttbl|colortbl|stylesheet|info|pict|header|footer)/;
  for (let m = drop.exec(s); m; m = drop.exec(s)) { let d = 0; let i = m.index; for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) break; } s = s.slice(0, m.index) + s.slice(i + 1); }
  return s.replace(/\\'([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\\pard?\b ?/g, '\n').replace(/\\line\b ?/g, '\n').replace(/\\tab\b ?/g, '\t').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\([\\{}])/g, '$1').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

interface NbCell { cell_type?: string; source?: string[] | string; outputs?: { text?: string[] | string; data?: Record<string, string[] | string> }[]; }
const joinLines = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join('') : (v ?? ''));
export function notebookText(raw: string): string {
  try {
    const cells = (JSON.parse(raw) as { cells?: NbCell[] }).cells ?? [];
    return cells.map((c, i) => {
      const out = c.cell_type === 'code' ? (c.outputs ?? []).map((o) => joinLines(o.text ?? o.data?.['text/plain'])).filter(Boolean).join('\n') : '';
      return `[${c.cell_type ?? 'cell'} ${i + 1}]\n${joinLines(c.source)}${out ? `\n[output]\n${out}` : ''}`;
    }).join('\n\n');
  } catch { return raw; }
}

// ---------------------------------------------------------------- unknown binaries: what the `strings` command would find
export function stringsOf(u8: Uint8Array, min = 5): string {
  const u = u8;
  const runs: { at: number; s: string }[] = []; const ok = (c: number) => (c >= 32 && c < 127) || c === 9 || c === 10 || c === 13;
  const latin = new TextDecoder('latin1'); const wide = new TextDecoder('utf-16le');
  for (let i = 0; i < u.length;) { if (ok(u[i])) { let j = i; while (j < u.length && ok(u[j])) j++; if (j - i >= min) runs.push({ at: i, s: latin.decode(u.subarray(i, j)) }); i = j; } else i++; }
  for (let i = 0; i + 1 < u.length;) { if (ok(u[i]) && u[i + 1] === 0) { let j = i; while (j + 1 < u.length && ok(u[j]) && u[j + 1] === 0) j += 2; if ((j - i) / 2 >= min) runs.push({ at: i, s: wide.decode(u.subarray(i, j)) }); i = j; } else i++; }
  runs.sort((a, b) => a.at - b.at);
  const out: string[] = []; let prev = '';
  for (const r of runs) { const s = r.s.trim(); if (!/[A-Za-z]{3}/.test(s) || s === prev) continue; prev = s; out.push(s); }
  return out.join('\n');
}

// ---------------------------------------------------------------- archives
function untar(u: Uint8Array): { path: string; data: Uint8Array }[] {
  const out: { path: string; data: Uint8Array }[] = []; const str = (a: number, n: number) => { let e = a; while (e < a + n && u[e] !== 0) e++; return dec(u.subarray(a, e)); };
  for (let off = 0; off + 512 <= u.length && u[off] !== 0;) {
    let name = str(off, 100); const prefix = str(off + 345, 155); if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8); const type = String.fromCharCode(u[off + 156] || 48); off += 512;
    if (type === '0' && Number.isFinite(size)) out.push({ path: name, data: u.subarray(off, off + size) });
    off += Math.ceil((Number.isFinite(size) ? size : 0) / 512) * 512;
  }
  return out;
}
const isTar = (u: Uint8Array) => u.length > 262 && dec(u.subarray(257, 262)) === 'ustar';

async function entryText(path: string, data: Uint8Array, depth: number): Promise<string> {
  const kind = classify({ name: path, type: '' });
  if (kind === 'image' || kind === 'video' || kind === 'audio') return `[${kind} file, ${sizeLabel(data.length)}: not opened]`;
  if (kind === 'binary') return `[binary file, ${sizeLabel(data.length)}: not opened]`;
  const blob = new Blob([data as BlobPart]);
  if (kind === 'pdf') { const t = await pdfText(blob); return t ? t.text : '[PDF with no readable text (scanned or locked)]'; }
  return (await readText({ id: path, name: path, mime: '', size: data.length, kind, blob }, depth + 1)).text;
}

async function archiveText(a: Attachment, depth: number): Promise<Readable> {
  const bytes = new Uint8Array(await a.blob.arrayBuffer()); const notes: string[] = []; let entries: { path: string; data: Uint8Array }[] = [];
  const magic = (...m: number[]) => m.every((b, i) => bytes[i] === b);
  if (magic(0x50, 0x4b)) {
    const files = unzipSync(bytes, { filter: (f) => !f.name.endsWith('/') });
    entries = Object.entries(files).map(([path, data]) => ({ path, data }));
  } else if (magic(0x1f, 0x8b)) {
    const inner = gunzipSync(bytes);
    entries = isTar(inner) ? untar(inner) : [{ path: a.name.replace(/\.(gz|gzip)$/i, ''), data: inner }];
  } else if (isTar(bytes)) entries = untar(bytes);
  else if (magic(0x37, 0x7a, 0xbc, 0xaf) || magic(0x52, 0x61, 0x72, 0x21) || magic(0x42, 0x5a, 0x68) || magic(0xfd, 0x37, 0x7a, 0x58) || magic(0x28, 0xb5, 0x2f, 0xfd)) {
    return { text: `[${a.name} is a 7z, RAR, bzip2, xz or zstd archive. These cannot be opened on this device. Export it as a ZIP and attach that.]`, notes: [`I could not open ${a.name}: 7z, RAR and similar archives are not supported. Send it as a ZIP.`] };
  }
  entries = entries.filter((e) => !/(^|\/)(__MACOSX|\.git|node_modules)\//.test(e.path) && !/(^|\/)\.DS_Store$/.test(e.path));
  const lines = [`Archive ${a.name}: ${entries.length} file${entries.length === 1 ? '' : 's'}`, ...entries.map((e) => `- ${e.path} (${sizeLabel(e.data.length)})`)];
  const body: string[] = [];
  for (const e of entries) {
    let t: string; try { t = await entryText(e.path, e.data, depth); } catch (err) { t = `[could not be read: ${err instanceof Error ? err.message : 'unknown error'}]`; notes.push(`${e.path} inside ${a.name} could not be read.`); }
    body.push(`=== ${e.path} ===\n${t}`);
  }
  return { text: `${lines.join('\n')}\n\n${body.join('\n\n')}`, notes };
}

// ---------------------------------------------------------------- the entry points
export async function readText(a: Attachment, depth = 0): Promise<Readable> {
  const e = ext(a.name);
  if (a.kind === 'text') { const t = await a.blob.text(); return { text: e === 'ipynb' ? notebookText(t) : e === 'rtf' ? rtfText(t) : t, notes: [] }; }
  if (a.kind === 'docx') return { text: await textOf(a), notes: [] };
  if (a.kind === 'archive') return archiveText(a, depth);
  const bytes = new Uint8Array(await a.blob.arrayBuffer());
  if (a.kind === 'office') {
    if (e === 'rtf') return { text: rtfText(dec(bytes)), notes: [] };
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(bytes); } catch { return { text: stringsOf(bytes), notes: [`${a.name} could not be opened as a document, so only the readable text inside it was recovered.`] }; }
    const text = e === 'xlsx' || e === 'xlsm' ? xlsxText(files) : e === 'pptx' ? pptxText(files) : e === 'epub' ? epubText(files) : odfText(files);
    return { text: text || '[No text was found in this document]', notes: [] };
  }
  // anything else: scan for readable text, like the `strings` command
  const t = stringsOf(bytes);
  return { text: t ? `[Readable text recovered from this file by scanning it; layout and formatting are lost.]\n${t}` : '[No readable text was found in this file.]', notes: t ? [`${a.name} is not a format I can open directly, so I read the text I could recover from it.`] : [`I could not find readable text in ${a.name}.`] };
}

/** Text from a PDF's own text layer, on this device. Returns null for scanned or locked PDFs (the provider reads those). */
export async function pdfText(blob: Blob): Promise<{ text: string; pages: number } | null> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default as string;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const parts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const tc = await (await doc.getPage(n)).getTextContent();
      parts.push(`--- Page ${n} ---\n${(tc.items as { str?: string; hasEOL?: boolean }[]).map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').trim()}`);
    }
    const text = parts.join('\n\n');
    return text.replace(/--- Page \d+ ---|\s/g, '').length < doc.numPages * 25 ? null : { text, pages: doc.numPages };
  } catch { return null; }
}

const asText = (a: Attachment, text: string): Attachment => { const blob = new Blob([text], { type: 'text/plain' }); return { ...a, kind: 'text', mime: 'text/plain', blob, size: blob.size }; };

/** Text-only reader: extracts text from supported documents on-device and never forwards media bytes. */
export async function readyFiles(files: Attachment[], opts: { step?: (s: string) => void }): Promise<{ files: Attachment[]; notes: string[] }> {
  const out: Attachment[] = []; const notes: string[] = [];
  for (const a of files) {
    opts.step?.(`Reading ${a.name}…`);
    try {
      if (['image', 'video', 'audio'].includes(a.kind)) { notes.push(`${a.name} is media and was not opened in this text-only app.`); continue; }
      if (a.kind === 'pdf') { const t = await pdfText(a.blob); if (t) out.push(asText(a, t.text)); else notes.push(`${a.name} has no readable PDF text layer (scanned/locked PDFs are unsupported).`); continue; }
      const r = await readText(a); out.push(asText(a, r.text)); notes.push(...r.notes);
    } catch (e) { out.push(asText(a, `[${a.name} could not be read: ${e instanceof Error ? e.message : 'unknown problem'}]`)); notes.push(`I could not read ${a.name}.`); }
  }
  return { files: out, notes };
}
