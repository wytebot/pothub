import { textOf, type Attachment } from './attachments';
import { markdownToDocx, markdownToPdf, wantedOutput, type OutFile, type OutFormat } from './deliver';
import { parseMarkdown, plainText, type Block, type Inline } from './markdown';
import { csvToXlsx, firstTable, markdownToPptx, parseCsv, rowsToCsv, safePath, sheetsToXlsx, zipEntries } from './office';

/**
 * Work that needs no AI model at all: zipping the attached files, turning a file (or the last answer, or pasted text)
 * into PDF / Word / Excel / PowerPoint / CSV / JSON / HTML / Markdown / text, merging PDFs, photos into a PDF.
 * Doing these on the device means no API key, no model, no waiting and no usage is asked for.
 */
export type LocalFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'json' | 'html' | 'md' | 'txt' | 'zip';
export interface LocalPlan {
  kind: 'zip' | 'convert' | 'merge' | 'images-pdf';
  format: LocalFormat;
  /** where the content comes from */
  source: 'files' | 'pasted' | 'last';
  /** pasted text or the previous answer */
  text?: string;
}
export interface LocalResult { text: string; file: OutFile; notes: string[]; }

const MIME: Record<LocalFormat, string> = {
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', json: 'application/json', html: 'text/html', md: 'text/markdown', txt: 'text/plain', zip: 'application/zip',
};
const LABEL: Record<LocalFormat, string> = { pdf: 'PDF', docx: 'Word document', xlsx: 'Excel workbook', pptx: 'PowerPoint deck', csv: 'CSV file', json: 'JSON file', html: 'web page', md: 'Markdown file', txt: 'text file', zip: 'ZIP file' };
const isLocalFormat = (f: OutFormat): f is LocalFormat => ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'json', 'html', 'md', 'txt', 'zip'].includes(f);

/** Words that mean a model has to think (read, write, judge, transform the meaning), so the request is NOT a plain file job. */
const THINKING = /\b(summari[sz]e|summary|translate|rewrite|rephrase|explain|analy[sz]e|analysis|improve|fix|debug|shorten|expand|proofread|correct|review|critique|extract|answer|describe|simplify|compare|find|check|what|why|how|who|when|where|which|create|generate|compose|draft|invent|brainstorm|suggest|recommend|plan|teach|quiz|calculate|solve)\b/;
const CONVERT = /\b(convert|turn|change|transform|save|export|download|put|make|give|send|get|produce|output|print|re-?save|write)\b|^\s*(to|as|into|in)\b/;
const REFERS = /\b(it|that|this|these|those|above|answer|response|reply|previous|last|same|everything)\b/;
const lastAnswer = (history: { role: string; text: string }[]) => [...history].reverse().find((t) => t.role === 'assistant' && t.text.trim().length > 20)?.text ?? '';

/**
 * Decides whether a request can be done on the device alone. Returns null whenever a model is needed
 * (anything that asks for reading, writing, summarising, translating, fixing ...), so nothing is ever skipped by mistake.
 */
export function detectLocal(prompt: string, files: Attachment[], history: { role: string; text: string }[] = []): LocalPlan | null {
  const t = prompt.trim().toLowerCase(); const want = wantedOutput(prompt);
  const words = t.split(/\s+/).filter(Boolean).length;
  const thinks = THINKING.test(t.replace(/\bmake sure\b/g, ''));
  if (files.length) {
    if (thinks && !/^\s*(please\s+)?(can you\s+)?(zip|merge|combine|join|convert|turn)\b/.test(t)) return null;
    if (thinks && /\b(summari[sz]e|translate|rewrite|explain|analy[sz]e|extract|fix|improve)\b/.test(t)) return null;
    const pdfs = files.filter((f) => f.kind === 'pdf');
    if (pdfs.length >= 2 && pdfs.length === files.length && /\b(merge|combine|join|put together|one pdf|single pdf)\b/.test(t)) return { kind: 'merge', format: 'pdf', source: 'files' };
    if (!isLocalFormat(want.format)) return null;
    if (want.format === 'zip') return files.length ? { kind: 'zip', format: 'zip', source: 'files' } : null;
    if (!CONVERT.test(t) && words > 6) return null;
    if (files.every((f) => f.kind === 'image') && want.format === 'pdf') return { kind: 'images-pdf', format: 'pdf', source: 'files' };
    if (files.every((f) => f.kind === 'text' || f.kind === 'docx')) return { kind: 'convert', format: want.format, source: 'files' };
    return null;
  }
  if (!isLocalFormat(want.format) || want.format === 'zip') return null;
  // "make it a PDF", "put that in Word": the previous answer, converted. Short, refers back, and asks for no new thinking.
  const prev = lastAnswer(history);
  if (prev && words <= 16 && REFERS.test(t) && CONVERT.test(t) && !THINKING.test(t.replace(/\b(write|give|make|get)\b/g, ''))) {
    if ((want.format === 'csv' || want.format === 'xlsx' || want.format === 'json') && !firstTable(prev) && !/```csv/i.test(prev)) return null;
    return { kind: 'convert', format: want.format, source: 'last', text: prev };
  }
  // "Convert this to PDF:" followed by the text itself
  const nl = prompt.indexOf('\n');
  if (nl > 0) {
    const head = prompt.slice(0, nl).trim().toLowerCase(); const body = prompt.slice(nl + 1).trim();
    if (head.length <= 200 && body.length >= 40 && CONVERT.test(head) && /\b(this|following|below|text|content|these|the text|my text)\b/.test(head) && !THINKING.test(head.replace(/\b(write|make|give)\b/g, '')) && wantedOutput(head).format === want.format)
      return { kind: 'convert', format: want.format, source: 'pasted', text: body };
  }
  return null;
}

// ------------------------------------------------------------------ conversions
const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || 'file';
const extOf = (n: string) => (n.split('.').pop() ?? '').toLowerCase();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rowsToMd = (rows: string[][]) => {
  const cols = Math.max(1, ...rows.map((r) => r.length)); const fix = (r: string[]) => Array.from({ length: cols }, (_, i) => mdCell(r[i] ?? ''));
  return [`| ${fix(rows[0] ?? []).join(' | ')} |`, `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`, ...rows.slice(1, 501).map((r) => `| ${fix(r).join(' | ')} |`)].join('\n');
};

const inlHtml = (xs: Inline[]) => xs.map((x) => { let s = esc(x.s); if (x.code) s = `<code>${s}</code>`; if (x.b) s = `<strong>${s}</strong>`; if (x.i) s = `<em>${s}</em>`; if (x.href && /^(https?:|mailto:)/.test(x.href)) s = `<a href="${esc(x.href)}">${s}</a>`; return s; }).join('');
const blockHtml = (b: Block): string => {
  switch (b.t) {
    case 'h': return `<h${b.level}>${inlHtml(b.inl)}</h${b.level}>`;
    case 'p': return `<p>${inlHtml(b.inl)}</p>`;
    case 'quote': return `<blockquote>${inlHtml(b.inl)}</blockquote>`;
    case 'hr': return '<hr>';
    case 'code': return `<pre><code>${esc(b.code)}</code></pre>`;
    case 'list': { const tag = b.items[0]?.ordered ? 'ol' : 'ul'; return `<${tag}>${b.items.map((i) => `<li>${inlHtml(i.inl)}</li>`).join('')}</${tag}>`; }
    case 'table': return `<table><thead><tr>${b.head.map((c) => `<th>${inlHtml(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inlHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
};
/** A tidy, self-contained web page from Markdown. */
export function markdownToHtml(md: string, title = 'Document'): string {
  const blocks = parseMarkdown(md); const h1 = blocks.find((b) => b.t === 'h' && b.level === 1);
  const name = h1 && h1.t === 'h' ? plainText(h1.inl) : title;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>body{font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:2.5rem auto;padding:0 1.2rem;color:#1b1b1b}h1,h2,h3{line-height:1.25}pre{background:#f4f4f4;padding:1rem;overflow:auto;border-radius:8px}code{background:#f1f1f1;padding:.1em .35em;border-radius:4px}pre code{background:none;padding:0}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #ccc;padding:.45rem .6rem;text-align:left}th{background:#f1f1f1}blockquote{margin:1rem 0;padding-left:1rem;border-left:3px solid #ccc;color:#555}@media(prefers-color-scheme:dark){body{background:#151515;color:#e8e8e8}pre,code,th{background:#232323}th,td{border-color:#444}}</style></head><body>\n${blocks.map(blockHtml).join('\n')}\n</body></html>\n`;
}
const plain = (md: string) => md.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[-*+]\s+/gm, '• ');

/** What a file looks like as Markdown, so one set of converters covers every input kind. */
async function asMarkdown(f: { name: string; kind: string; blob: Blob }): Promise<{ md: string; rows?: string[][] }> {
  const e = extOf(f.name);
  if (f.kind === 'docx') return { md: (await textOf(f as Attachment)).split('\n').map((l) => l.trimEnd()).join('\n\n').replace(/\n{3,}/g, '\n\n') };
  const text = await f.blob.text();
  if (e === 'csv' || e === 'tsv') { const rows = parseCsv(text); return { md: `# ${baseName(f.name)}\n\n${rows.length ? rowsToMd(rows) : '(empty)'}`, rows }; }
  if (e === 'md' || e === 'markdown') return { md: text, rows: firstTable(text) ?? undefined };
  if (e === 'txt' || e === 'log' || e === 'rtf') return { md: text.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean).join('\n\n') || text };
  if (e === 'json') { let pretty = text; try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep as is */ } return { md: `# ${f.name}\n\n\`\`\`json\n${pretty}\n\`\`\`` }; }
  return { md: `# ${f.name}\n\n\`\`\`${e}\n${text.replace(/```/g, '`\u200b``')}\n\`\`\`` }; // code and everything else readable
}

async function toFormat(src: { md: string; rows?: string[][] }, to: LocalFormat, name: string): Promise<{ blob: Blob; name: string }> {
  const base = safePath(baseName(name)) || 'file';
  switch (to) {
    case 'pdf': return { blob: await markdownToPdf(src.md), name: `${base}.pdf` };
    case 'docx': return { blob: markdownToDocx(src.md), name: `${base}.docx` };
    case 'pptx': return { blob: markdownToPptx(src.md), name: `${base}.pptx` };
    case 'html': return { blob: new Blob([markdownToHtml(src.md, base)], { type: MIME.html }), name: `${base}.html` };
    case 'md': return { blob: new Blob([src.md], { type: MIME.md }), name: `${base}.md` };
    case 'txt': return { blob: new Blob([plain(src.md)], { type: MIME.txt }), name: `${base}.txt` };
    case 'xlsx': {
      const rows = src.rows ?? firstTable(src.md) ?? src.md.split('\n').filter((l) => l.trim() && !/^#+\s/.test(l)).map((l) => [l.replace(/^[-*]\s+/, '')]);
      return { blob: rows.length ? sheetsToXlsx([{ name: 'Sheet1', rows }]) : csvToXlsx(''), name: `${base}.xlsx` };
    }
    case 'csv': {
      const rows = src.rows ?? firstTable(src.md); if (!rows) throw new Error('This has no table or columns to turn into CSV. Ask me to write the data as a CSV and I will.');
      return { blob: new Blob(['\ufeff', rowsToCsv(rows)], { type: MIME.csv }), name: `${base}.csv` };
    }
    case 'json': {
      const rows = src.rows ?? firstTable(src.md); if (!rows || rows.length < 2) throw new Error('This has no table or columns to turn into JSON. Ask me to write the data as JSON and I will.');
      const [head, ...rest] = rows; const keys = head.map((h, i) => h.trim() || `column${i + 1}`);
      return { blob: new Blob([JSON.stringify(rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, /^-?\d+(\.\d+)?$/.test((r[i] ?? '').trim()) ? Number(r[i]) : r[i] ?? '']))), null, 2)], { type: MIME.json }), name: `${base}.json` };
    }
    default: throw new Error('That conversion needs a model. Describe what you want and I will write it.');
  }
}

async function imageToPng(blob: Blob): Promise<Uint8Array> {
  const bmp = await createImageBitmap(blob); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  cv.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
  const out = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png')); if (!out) throw new Error('One of the photos could not be read.');
  return new Uint8Array(await out.arrayBuffer());
}
async function imagesToPdf(files: Attachment[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib'); const pdf = await PDFDocument.create();
  for (const f of files) {
    const bytes = new Uint8Array(await f.blob.arrayBuffer());
    const img = f.mime === 'image/jpeg' || /\.jpe?g$/i.test(f.name) ? await pdf.embedJpg(bytes) : f.mime === 'image/png' || /\.png$/i.test(f.name) ? await pdf.embedPng(bytes) : await pdf.embedPng(await imageToPng(f.blob));
    const land = img.width > img.height; const [pw, ph] = land ? [841.89, 595.28] : [595.28, 841.89]; const m = 24;
    const s = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height, 1); const w = img.width * s; const h = img.height * s;
    pdf.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return new Blob([(await pdf.save()) as unknown as BlobPart], { type: MIME.pdf });
}
async function mergePdfs(files: Attachment[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib'); const out = await PDFDocument.create();
  for (const f of files) {
    let doc; try { doc = await PDFDocument.load(await f.blob.arrayBuffer(), { ignoreEncryption: true }); } catch { throw new Error(`I could not open ${f.name}. It may be damaged or password protected.`); }
    for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p);
  }
  return new Blob([(await out.save()) as unknown as BlobPart], { type: MIME.pdf });
}

const an = (s: string) => `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`;
const stamp = () => new Date().toISOString().slice(0, 10);
/** Runs a plan from detectLocal. Throws a friendly Error when the content cannot be converted that way. */
export async function runLocal(plan: LocalPlan, files: Attachment[]): Promise<LocalResult> {
  const notes: string[] = []; let blob: Blob; let name: string; let did: string;
  if (plan.kind === 'zip') {
    const entries = await Promise.all(files.map(async (f) => ({ path: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
    blob = zipEntries(entries); name = files.length === 1 ? `${safePath(baseName(files[0].name)) || 'files'}.zip` : `files-${stamp()}.zip`; did = `Zipped ${files.length} file${files.length === 1 ? '' : 's'}`;
  } else if (plan.kind === 'merge') { blob = await mergePdfs(files); name = `merged-${stamp()}.pdf`; did = `Merged ${files.length} PDFs into one`; }
  else if (plan.kind === 'images-pdf') { blob = await imagesToPdf(files); name = files.length === 1 ? `${safePath(baseName(files[0].name)) || 'photo'}.pdf` : `photos-${stamp()}.pdf`; did = `Put ${files.length} photo${files.length === 1 ? '' : 's'} into a PDF`; }
  else if (plan.source === 'files') {
    const done: { blob: Blob; name: string }[] = [];
    for (const f of files) { try { done.push(await toFormat(await asMarkdown(f), plan.format, f.name)); } catch (e) { if (files.length === 1) throw e; notes.push(`${f.name} was left out: ${e instanceof Error ? e.message : 'it could not be converted'}`); } }
    if (!done.length) throw new Error('None of these files could be converted that way.');
    if (done.length === 1) { blob = done[0].blob; name = done[0].name; did = `Converted ${files[0].name} to ${an(LABEL[plan.format])}`; }
    else { blob = zipEntries(await Promise.all(done.map(async (d) => ({ path: d.name, data: new Uint8Array(await d.blob.arrayBuffer()) })))); name = `converted-${stamp()}.zip`; did = `Converted ${done.length} files to ${LABEL[plan.format]}s and zipped them`; }
  } else {
    const md = plan.text ?? ''; const title = md.match(/^\s*#{1,2}\s+(.+?)\s*#*\s*$/m)?.[1]?.replace(/[*_`]/g, '') ?? 'pothub-answer';
    const rows = firstTable(md) ?? (() => { const c = md.match(/```csv[^\n]*\n([\s\S]*?)```/i); return c ? parseCsv(c[1]) : undefined; })();
    const out = await toFormat({ md, rows }, plan.format, title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'pothub-answer');
    blob = out.blob; name = out.name; did = `Made ${an(LABEL[plan.format])} from ${plan.source === 'last' ? 'my last answer' : 'your text'}`;
  }
  return { text: `${did}. It was built on this device, so no AI model or key was used.`, file: { blob, name, mime: MIME[plan.format] }, notes };
}
