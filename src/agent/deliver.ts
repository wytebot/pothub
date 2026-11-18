import { strToU8, zipSync } from 'fflate';
import { parseMarkdown, plainText, rawFromReply, type Block, type Inline } from './markdown';
import { csvToXlsx, markdownToPptx } from './office';
import { BUNDLE_PROTOCOL } from './protocol';

export type OutFormat = 'chat' | 'md' | 'txt' | 'csv' | 'json' | 'html' | 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'zip' | 'file';
export interface Wanted { format: OutFormat; /** deliver as a downloadable file as well as in the chat */ file: boolean; /** shown to the person when the exact format asked for is not available yet */ note?: string; /** for format 'file': the extension to save (py, sql, yaml, svg ...) */ ext?: string; }

/** Plain-text formats that can be written on request and saved under their own extension. */
export const TEXT_EXTS = ['py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'css', 'scss', 'sql', 'yaml', 'yml', 'xml', 'svg', 'ics', 'srt', 'vtt', 'tex', 'sh', 'bat', 'ps1', 'ini', 'toml', 'env', 'log', 'tsv', 'java', 'kt', 'swift', 'go', 'rs', 'c', 'cpp', 'cs', 'php', 'rb', 'dart', 'lua', 'r', 'vue', 'svelte', 'gradle', 'properties', 'conf', 'dockerfile', 'gitignore', 'rtf', 'vcf', 'eml', 'bib', 'tf'];
const MIME: Record<string, string> = { svg: 'image/svg+xml', xml: 'application/xml', ics: 'text/calendar', css: 'text/css', yaml: 'text/yaml', yml: 'text/yaml', tsv: 'text/tab-separated-values', rtf: 'application/rtf', vcf: 'text/vcard', js: 'text/javascript', mjs: 'text/javascript' };

// A format only counts as the OUTPUT when the wording asks for it ("as a PDF", "into Word", "make me an Excel sheet"),
// so "summarise this PDF" or "fix the bug in app.py" are not mistaken for a request to build a file.
const CUE = '(?:as|into|to|in|make|create|generate|build|produce|write|draft|prepare|give me|send me|get me|export(?: it| this| them)?(?: as| to)?|save(?: it| this| them)?(?: as| to)?|convert(?: it| this| them)?(?: to| into)|turn(?: it| this| them)?(?: into| to)|need|want)';
const outRe = (fmt: string) => new RegExp(`\\b${CUE}\\s+(?:me\\s+)?(?:(?:an?|the|one|some|my|your)\\s+)?(?:(?!(?:of|this|that|attached|uploaded|these|those)\\b)[\\w-]+\\s+){0,2}(?:${fmt})\\b`, 'i');
const pointing = (fmt: string) => new RegExp(`\\b(?:make|turn|convert|save|export|put|give me|get|change)\\s+(?:this|that|it|them|these|those|the above|the answer|everything)\\s+(?:(?:into|to|as|in)\\s+)?(?:an?\\s+|the\\s+)?(?:${fmt})\\b`, 'i');
const asks = (t: string, fmt: string) => outRe(fmt).test(t) || pointing(fmt).test(t) || new RegExp(`(?<!\\b(?:this|that|the|attached|uploaded|my|these|those)\\s)\\b(?:${fmt})\\s+(?:file|document|doc|version|copy|download|sheet|deck)\\b`, 'i').test(t) || new RegExp(`^\\s*(?:${fmt})\\b|\\b(?:in|as)\\s+(?:${fmt})\\s+format\\b`, 'i').test(t);

/** Reads the wording of a request and decides how the answer should be delivered. Nothing named = a well-formatted chat answer. */
export function wantedOutput(prompt: string): Wanted {
  const t = prompt.toLowerCase();
  const fileAsk = /\b(as|in|into|to) (a |an )?(downloadable |separate )?(file|document)\b|\bdownload(able)?\b|\bsave (it |this )?as\b|\bexport( it| this)?( as| to)?\b|\b(send|give) me (a |the )?file\b/.test(t);
  // one archive holding several files ("the whole project as a zip", "zip it", "a zip with a PDF and a CSV")
  if (/\.zip\b|\bzipped\b|\bzip (it|them|up|everything|all|the|file|folder|archive)\b/.test(t) || (asks(t, 'zip|archive|bundle') && !/\bzip ?codes?\b/.test(t)) || (/\b(whole|entire|full|complete) (project|app|website|codebase|source code)\b/.test(t) && (fileAsk || /\bfiles?\b/.test(t))))
    return { format: 'zip', file: true };
  if (asks(t, 'docx|\\.docx|word(?: doc(?:ument)?| file| format)|ms word|microsoft word') || /\b(?:as|into|to|in)\s+(?:an?\s+)?word\b(?!\s+(?:list|lists|count|problem|search|game|games|bank|cloud|limit|puzzle|processor))/.test(t)) return { format: 'docx', file: true };
  if (asks(t, 'pdf|\\.pdf')) return { format: 'pdf', file: true };
  if (asks(t, 'xlsx|\\.xlsx|excel|spreadsheet|google sheets?|workbook')) return { format: 'xlsx', file: true };
  if (asks(t, 'csv|\\.csv')) return { format: 'csv', file: true };
  if (asks(t, 'pptx|\\.pptx|powerpoint|power point|slide ?deck|slides|presentation|keynote')) return { format: 'pptx', file: true };
  if (asks(t, 'json|\\.json')) return { format: 'json', file: true };
  if (/\b(convert|turn|export|save|change|transform)\b/.test(t) && asks(t, 'html|\\.html|web ?page')) return { format: 'html', file: true };
  if (/\b(html|web ?page|landing page)\b/.test(t) && /\b(write|create|make|build|generate|code)\b/.test(t) && !/\b(react|vue|next|angular|svelte|project|app)\b/.test(t)) return { format: 'html', file: true };
  if (asks(t, 'markdown|\\.md')) return { format: 'md', file: true };
  if (asks(t, 'plain text|\\.txt|text file|txt')) return { format: 'txt', file: true };
  // any other text-based format: a ".py file", "as a YAML file", "save it as notes.sql"
  const exts = TEXT_EXTS.join('|');
  const named = t.match(new RegExp(`\\b(?:named|called|name it|save (?:it )?as|as|to|into)\\s+["'\`]?[\\w-]+\\.(${exts})\\b`)) ?? t.match(new RegExp(`(?:^|\\s)\\.(${exts})\\s+file\\b`));
  const typed = t.match(new RegExp(`\\b(${exts}) (?:file|format|config|script)\\b`)) ?? (outRe(`\\.?(${exts})`).exec(t) && t.match(new RegExp(`\\.(${exts})\\b`)));
  const ext = (named?.[1] ?? typed?.[1])?.toLowerCase();
  if (ext && (fileAsk || named || /\b(write|create|make|build|generate|give|output|as|in|into)\b/.test(t))) return { format: 'file', file: true, ext };
  if (fileAsk) return { format: /\b(report|letter|proposal|cv|resume|essay|contract|policy|plan|minutes|memo|cover letter|speech|guide|handbook|article|assignment|lesson)\b/.test(t) ? 'docx' : 'md', file: true };
  return { format: 'chat', file: false };
}

export const FORMAT_LABEL: Record<OutFormat, string> = { chat: 'chat', md: 'Markdown', txt: 'text', csv: 'CSV', json: 'JSON', html: 'HTML', docx: 'Word', pdf: 'PDF', xlsx: 'Excel', pptx: 'PowerPoint', zip: 'ZIP', file: 'file' };

/** What the text model is told. It is kept in one place so every provider receives the same standard. */
export function systemPrompt(w: Wanted, o: { today?: string; hasFiles?: boolean } = {}): string {
  const base = [
    'You are the writing, analysis and coding engine inside Pothub. Do the job the person asked for, completely.',
    'Quality bar: be extensive, accurate, specific and well organised. Cover the topic in real depth, with concrete detail, examples, numbers, steps or reasoning where they help. Never pad, never repeat yourself, and never stop early or say that you will "continue later".',
    'Match the request: a short factual question gets a direct answer first; a report, plan, guide, essay, analysis, study material or document gets a full, professional treatment. If the person gives a length, language, tone, audience or structure, follow it exactly. Reply in the language the person writes in.',
    'Structure: use Markdown. Start with the answer or a one-line summary, then use clear headings, short paragraphs, lists for steps and options, tables for comparisons, and fenced code blocks (with the language name) for all code, commands and config. Give complete working code, never fragments with "rest of code here".',
    'Honesty: if something is uncertain or you cannot know it, say so plainly. Do not invent sources, quotes, statistics or links. If the request is ambiguous, make the most sensible assumption, state it in one line, and carry on instead of asking questions.',
    'Never ask the person for an API key, model name, provider, framework or other setup detail that the task does not strictly need. Choose sensible defaults, state any assumption in one line, and deliver the result. When the person asks for code, an app or a project, deliver complete, working files.',
    o.hasFiles ? 'The person attached files. Read them carefully and base your answer on their actual content; refer to them by name.' : '',
    o.today ? `Today's date is ${o.today}.` : '',
  ];
  const fmt: Record<OutFormat, string> = {
    chat: 'Format: a polished chat answer in Markdown.',
    md: 'Format: one complete Markdown document with a title (#), sections (##) and sub-sections. No chatter before or after it.',
    txt: 'Format: one complete plain-text document. No Markdown symbols; use simple spacing and capital-letter headings.',
    docx: 'Format: one complete professional document in Markdown that will be turned into a Word file: a title (#), numbered or named sections (##, ###), lists and tables where useful. No chatter before or after the document, and no code fence around it.',
    pdf: 'Format: one complete professional document in Markdown that will be turned into a PDF: a title (#), sections (##, ###), lists and tables where useful. Use plain characters. No chatter before or after the document, and no code fence around it.',
    csv: 'Format: output ONLY valid CSV inside one ```csv code block: a header row, then one row per record, comma separated, quoting any value that contains a comma or quote. Put nothing else in the reply.',
    json: 'Format: output ONLY valid, complete, pretty-printed JSON inside one ```json code block. Put nothing else in the reply.',
    html: 'Format: output ONE complete, self-contained HTML5 document (inline CSS and JS, responsive, accessible, polished design) inside one ```html code block. Put nothing else in the reply.',
    xlsx: 'Format: output ONLY valid CSV inside one ```csv code block, which becomes a real Excel workbook: a header row, then one row per record, quoting any value that contains a comma or quote. Write numbers as plain numbers (no currency symbols or thousands separators) and use Excel formulas such as =SUM(B2:B9) for totals. For several sheets, start each with a line "--- sheet: Name ---". Put nothing else in the reply.',
    pptx: 'Format: a slide deck written as a Markdown outline that becomes a real PowerPoint file: "# Deck title" then one short subtitle line, then one "## Slide title" per slide followed by 3 to 6 short bullet points (under 14 words each). Unless told otherwise make 8 to 12 slides with a clear story: opening, key points, evidence or examples, next steps. No chatter before or after, no code fence.',
    zip: `Format: several files that will be delivered together as one ZIP. ${BUNDLE_PROTOCOL}`,
    file: `Format: output ONLY the complete, raw contents of one .${w.ext ?? 'txt'} file inside a single \`\`\`${w.ext ?? 'text'} code block. Put nothing else in the reply.`,
  };
  return [...base.filter(Boolean), fmt[w.format]].join('\n\n');
}

// -------------------------------------------------------------------------- files
const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'pothub-answer';
const titleOf = (md: string, fallback: string) => { const h = md.match(/^\s*#{1,2}\s+(.+?)\s*#*\s*$/m); return (h ? h[1].replace(/[*_`]/g, '') : fallback).slice(0, 90); };
export interface OutFile { blob: Blob; name: string; mime: string; }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function runsXml(inl: Inline[], base = ''): string {
  return inl.map((x) => {
    const rpr = `${base}${x.b ? '<w:b/>' : ''}${x.i ? '<w:i/>' : ''}${x.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : ''}${x.href ? '<w:color w:val="1F4FBF"/><w:u w:val="single"/>' : ''}`;
    return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(x.s)}</w:t></w:r>`;
  }).join('');
}
const para = (inl: Inline[], style?: string, extra = '', base = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${runsXml(inl, base)}</w:p>`;

function blocksToDocx(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.t === 'h') out.push(para(b.inl, b.level === 1 ? 'Title' : `Heading${Math.min(b.level - 1, 3)}`));
    else if (b.t === 'p') out.push(para(b.inl));
    else if (b.t === 'quote') out.push(para(b.inl, 'Quote'));
    else if (b.t === 'hr') out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>');
    else if (b.t === 'code') for (const ln of (b.code || ' ').split('\n')) out.push(`<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${esc(ln) || ' '}</w:t></w:r></w:p>`);
    else if (b.t === 'list') for (const it of b.items) out.push(para([{ s: it.ordered ? `${it.num}.\u00a0` : '•\u00a0' }, ...it.inl], undefined, `<w:ind w:left="${360 + it.depth * 360}" w:hanging="300"/><w:spacing w:after="60"/>`));
    else if (b.t === 'table') {
      const cols = Math.max(b.head.length, ...b.rows.map((r) => r.length), 1); const w = Math.floor(9360 / cols);
      const cell = (c: Inline[] | undefined, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E7E7"/>' : ''}</w:tcPr>${para(c ?? [], undefined, '<w:spacing w:after="0"/>', head ? '<w:b/>' : '')}</w:tc>`;
      const row = (r: Inline[][], head: boolean) => `<w:tr>${Array.from({ length: cols }, (_, i) => cell(r[i], head)).join('')}</w:tr>`;
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${row(b.head, true)}${b.rows.map((r) => row(r, false)).join('')}</w:tbl>`, '<w:p/>');
    }
  }
  return out.join('');
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style></w:styles>`;

export function markdownToDocx(md: string): Blob {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${blocksToDocx(parseMarkdown(md))}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/document.xml': strToU8(doc),
    'word/styles.xml': strToU8(STYLES),
  };
  return new Blob([zipSync(files) as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** PDF with the built-in fonts. Those fonts cannot draw every symbol, so unusual characters are swapped for close plain ones. */
const WIN = (s: string) => s.replace(/₦/g, 'NGN ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/[✓✔]/g, 'v').replace(/[→⇒]/g, '->').replace(/[^\x09\x0a\x20-\x7e\u00a1-\u00ff•]/g, '?');
export async function markdownToPdf(md: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const f = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), i: await pdf.embedFont(StandardFonts.HelveticaOblique), c: await pdf.embedFont(StandardFonts.Courier) };
  const W = 595.28; const H = 841.89; const M = 54; const maxW = W - M * 2;
  let page = pdf.addPage([W, H]); let y = H - M;
  const ensure = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const font = (x: Inline) => (x.code ? f.c : x.b ? f.b : x.i ? f.i : f.r);

  /** Draws runs with word wrapping. */
  const flow = (inl: Inline[], size: number, o: { indent?: number; gap?: number; bold?: boolean; color?: [number, number, number]; prefix?: string } = {}) => {
    const ind = o.indent ?? 0; const lh = size * 1.38; const words: { t: string; fn: typeof f.r; link: boolean }[] = [];
    if (o.prefix) words.push({ t: o.prefix, fn: f.r, link: false });
    for (const x of inl) for (const w of WIN(x.s).split(/(\s+)/)) if (w) words.push({ t: w, fn: o.bold ? f.b : font(x), link: !!x.href });
    let line: typeof words = []; let lw = 0; const x0 = M + ind;
    const flush = () => {
      ensure(lh); y -= lh; let x = x0;
      // Words that share a font and colour are drawn as one run, so the PDF reads and copies as normal sentences.
      for (let a = 0; a < line.length;) {
        let z = a; let t = '';
        while (z < line.length && line[z].fn === line[a].fn && line[z].link === line[a].link) t += line[z++].t;
        page.drawText(t, { x, y: y + size * 0.22, size, font: line[a].fn, color: line[a].link ? rgb(0.12, 0.31, 0.75) : rgb(...(o.color ?? [0.1, 0.1, 0.1])) });
        x += line[a].fn.widthOfTextAtSize(t, size); a = z;
      }
      line = []; lw = 0;
    };
    for (const w of words) {
      const wd = w.fn.widthOfTextAtSize(w.t, size);
      if (/^\s+$/.test(w.t)) { if (line.length) { line.push(w); lw += wd; } continue; }
      if (lw + wd > maxW - ind && line.length) { while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop(); flush(); }
      if (wd > maxW - ind) { // a single very long token: cut it
        let chunk = ''; for (const ch of w.t) { if (w.fn.widthOfTextAtSize(chunk + ch, size) > maxW - ind) { line.push({ ...w, t: chunk }); flush(); chunk = ''; } chunk += ch; } if (chunk) { line.push({ ...w, t: chunk }); lw += w.fn.widthOfTextAtSize(chunk, size); } continue;
      }
      line.push(w); lw += wd;
    }
    if (line.length) { while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop(); flush(); }
    y -= o.gap ?? size * 0.5;
  };

  for (const b of parseMarkdown(md)) {
    if (b.t === 'h') { const s = [26, 19, 15.5, 13, 12, 11][b.level - 1]; y -= b.level === 1 ? 4 : 8; ensure(s * 2.2); flow(b.inl, s, { bold: true, gap: s * 0.4 }); }
    else if (b.t === 'p') flow(b.inl, 10.5);
    else if (b.t === 'quote') flow(b.inl, 10.5, { indent: 16, color: [0.35, 0.35, 0.35] });
    else if (b.t === 'hr') { ensure(14); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) }); y -= 8; }
    else if (b.t === 'list') for (const it of b.items) flow(it.inl, 10.5, { indent: 14 + it.depth * 16, gap: 3, prefix: it.ordered ? `${it.num}. ` : '- ' });
    else if (b.t === 'code') {
      for (const ln of WIN(b.code).split('\n')) { const parts = ln.match(/.{1,92}/g) ?? ['']; for (const part of parts) { ensure(12); y -= 12; page.drawRectangle({ x: M - 4, y: y - 2.5, width: maxW + 8, height: 12, color: rgb(0.94, 0.94, 0.94) }); page.drawText(part, { x: M, y, size: 8.6, font: f.c, color: rgb(0.1, 0.1, 0.1) }); } }
      y -= 8;
    } else if (b.t === 'table') {
      const cols = Math.max(b.head.length, ...b.rows.map((r) => r.length), 1); const cw = maxW / cols; const rows = [b.head, ...b.rows];
      rows.forEach((r, ri) => {
        const lines = r.map((c) => { const txt = WIN(plainText(c)); const fn = ri === 0 ? f.b : f.r; const out: string[] = []; let cur = ''; for (const w of txt.split(/\s+/)) { const t = cur ? `${cur} ${w}` : w; if (fn.widthOfTextAtSize(t, 9.5) > cw - 8 && cur) { out.push(cur); cur = w; } else cur = t; } out.push(cur); return out; });
        const n = Math.max(1, ...lines.map((l) => l.length)); const rh = n * 12.5 + 6; ensure(rh);
        for (let ci = 0; ci < cols; ci++) { const x = M + ci * cw; page.drawRectangle({ x, y: y - rh, width: cw, height: rh, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.6, color: ri === 0 ? rgb(0.91, 0.91, 0.91) : undefined }); (lines[ci] ?? []).forEach((t, li) => page.drawText(t, { x: x + 4, y: y - 12 - li * 12.5, size: 9.5, font: ri === 0 ? f.b : f.r, color: rgb(0.1, 0.1, 0.1) })); }
        y -= rh;
      });
      y -= 10;
    }
  }
  const pages = pdf.getPages(); pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: W / 2 - 14, y: 26, size: 8.5, font: f.r, color: rgb(0.5, 0.5, 0.5) }));
  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

/** Builds the downloadable file for a finished answer. Returns null when the answer is only meant for the chat. */
export async function buildFile(reply: string, w: Wanted, prompt: string): Promise<OutFile | null> {
  if (!w.file || w.format === 'chat') return null;
  const title = titleOf(reply, prompt); const base = safe(title);
  switch (w.format) {
    case 'docx': return { blob: markdownToDocx(reply), name: `${base}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    case 'pdf': return { blob: await markdownToPdf(reply), name: `${base}.pdf`, mime: 'application/pdf' };
    case 'csv': return { blob: new Blob(['\ufeff', rawFromReply(reply, ['csv'])], { type: 'text/csv' }), name: `${base}.csv`, mime: 'text/csv' };
    case 'json': return { blob: new Blob([rawFromReply(reply, ['json'])], { type: 'application/json' }), name: `${base}.json`, mime: 'application/json' };
    case 'html': return { blob: new Blob([rawFromReply(reply, ['html'])], { type: 'text/html' }), name: `${base}.html`, mime: 'text/html' };
    case 'xlsx': return { blob: csvToXlsx(rawFromReply(reply, ['csv'])), name: `${base}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    case 'pptx': return { blob: markdownToPptx(reply), name: `${base}.pptx`, mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    case 'file': { const e = w.ext ?? 'txt'; const mime = MIME[e] ?? 'text/plain'; return { blob: new Blob([rawFromReply(reply, [e, 'text', 'plaintext'])], { type: mime }), name: e === 'dockerfile' || e === 'gitignore' ? (e === 'dockerfile' ? 'Dockerfile' : '.gitignore') : `${base}.${e}`, mime }; }
    case 'zip': return null; // built from several files by bundle.ts
    case 'md': return { blob: new Blob([reply], { type: 'text/markdown' }), name: `${base}.md`, mime: 'text/markdown' };
    case 'txt': return { blob: new Blob([reply.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1')], { type: 'text/plain' }), name: `${base}.txt`, mime: 'text/plain' };
  }
}
