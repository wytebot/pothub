import { strToU8, zipSync } from 'fflate';
import { parseInline, plainText } from './markdown';

/** Real Excel and PowerPoint files, plain ZIP archives and CSV reading, built on the device with no AI model and no network. */
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const xe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '');
const pack = (files: Record<string, Uint8Array>, type: string) => new Blob([zipSync(files, { level: 6 }) as unknown as BlobPart], { type });

// ------------------------------------------------------------------ ZIP
export interface ZipEntry { path: string; data: Uint8Array; }
/** Keeps a path inside the archive: no leading slash, no "..", no drive letters, forward slashes only. */
export function safePath(p: string): string {
  const parts = p.replace(/\\/g, '/').replace(/^[a-z]:/i, '').split('/').map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..');
  return parts.join('/').replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 200);
}
/** Builds a ZIP. Duplicate paths get a number so nothing is lost. */
export function zipEntries(entries: ZipEntry[]): Blob {
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) {
    const orig = safePath(e.path) || 'file'; let p = orig; let n = 1;
    while (files[p]) { const dot = orig.lastIndexOf('.'); const slash = orig.lastIndexOf('/'); p = dot > slash + 1 ? `${orig.slice(0, dot)} (${++n})${orig.slice(dot)}` : `${orig} (${++n})`; }
    files[p] = e.data;
  }
  return pack(files, 'application/zip');
}

// ------------------------------------------------------------------ CSV
/** Reads CSV (comma, semicolon or tab separated, quoted values, line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const first = src.split('\n', 1)[0] ?? '';
  const delim = [',', ';', '\t'].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch; }
    else if (ch === '"' && cur === '') quoted = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
export const csvEscape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const rowsToCsv = (rows: string[][]) => rows.map((r) => r.map(csvEscape).join(',')).join('\n');

/** A Markdown table (the kind a chat answer often contains) as rows, or null when the text is not one. */
export function tableRows(md: string): string[][] | null {
  const lines = md.split('\n').filter((l) => l.trim());
  if (lines.length < 2 || !lines[0].includes('|') || !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[1])) return null;
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => plainText(parseInline(c.trim())));
  return [cells(lines[0]), ...lines.slice(2).filter((l) => l.includes('|')).map(cells)];
}

/** The first Markdown table anywhere in a text (an answer usually has a heading or a sentence above it). */
export function firstTable(md: string): string[][] | null {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1]) || !lines[i + 1].includes('|')) continue;
    let j = i; const blk: string[] = []; while (j < lines.length && lines[j].trim() && lines[j].includes('|')) blk.push(lines[j++]);
    return tableRows(blk.join('\n'));
  }
  return null;
}

// ------------------------------------------------------------------ XLSX
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const NUM = /^-?(0|[1-9]\d{0,14})(\.\d{1,12})?$/;
export interface Sheet { name: string; rows: string[][]; }

/** Splits a CSV answer into sheets. A line like "--- sheet: Budget ---" starts a new sheet; without one there is a single sheet. */
export function sheetsFrom(text: string): Sheet[] {
  const marks = [...text.matchAll(/^[-=#\s]*sheet:\s*(.+?)[-=\s]*$/gim)];
  const read = (t: string) => { const r = tableRows(t.trim()); return r ?? parseCsv(t); };
  if (!marks.length) return [{ name: 'Sheet1', rows: read(text) }];
  return marks.map((m, i) => ({ name: m[1].trim(), rows: read(text.slice((m.index ?? 0) + m[0].length, marks[i + 1]?.index ?? text.length)) }));
}
const sheetName = (n: string, used: Set<string>) => {
  let base = n.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet'; let name = base; let k = 1;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${++k}`; used.add(name.toLowerCase()); return name;
};

function sheetXml(rows: string[][]): string {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const width = Array.from({ length: cols }, (_, c) => Math.min(60, Math.max(8, ...rows.slice(0, 200).map((r) => Math.min(60, (r[c] ?? '').length + 2)))));
  const data = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`; const t = v.trim();
    if (v === '') return '';
    if (ri > 0 && t.startsWith('=') && t.length > 1) return `<c r="${ref}"><f>${xe(t.slice(1))}</f></c>`;
    if (ri > 0 && NUM.test(t)) return `<c r="${ref}"><v>${t}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${colName(cols - 1)}${Math.max(1, rows.length)}"/><sheetViews><sheetView workbookViewId="0">${rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${width.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData></worksheet>`;
}

/** A real .xlsx file (opens in Excel, Google Sheets and Numbers). Numbers stay numbers, "=SUM(A2:A9)" stays a formula, the first row is a bold header. */
export function sheetsToXlsx(input: Sheet[]): Blob {
  const used = new Set<string>(); const sheets = (input.length ? input : [{ name: 'Sheet1', rows: [[]] }]).map((s) => ({ name: sheetName(s.name, used), rows: s.rows.length ? s.rows : [[]] }));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows)); });
  return pack(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
export const csvToXlsx = (csv: string) => sheetsToXlsx(sheetsFrom(csv));

// ------------------------------------------------------------------ PPTX
export interface Slide { title: string; lines: { text: string; level: number }[]; lead?: boolean; }

/** Reads a Markdown outline into slides: every # or ## heading starts a slide, bullets and paragraphs become its lines. */
export function slidesFrom(md: string): Slide[] {
  const slides: Slide[] = []; let fenced = false; let firstLevel = 0;
  const start = (title: string): Slide => { const s: Slide = { title, lines: [] }; slides.push(s); return s; };
  const strip = (s: string) => plainText(parseInline(s.trim()));
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(l)) { fenced = !fenced; continue; }
    const h = !fenced ? l.match(/^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/) : null;
    if (h) { if (!slides.length) firstLevel = h[1].length; start(strip(h[2])); continue; }
    if (!fenced && /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { if (slides.length && slides[slides.length - 1].lines.length) start(''); continue; }
    if (!l.trim()) continue;
    const c = slides.length ? slides[slides.length - 1] : start('');
    if (!fenced && l.includes('|') && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) { // a table: one line per row
      let j = i; const blk: string[] = []; while (j < lines.length && lines[j].trim() && lines[j].includes('|')) blk.push(lines[j++]);
      const rows = tableRows(blk.join('\n'));
      if (rows) { rows.forEach((r, k) => c.lines.push({ text: r.join('  |  '), level: k === 0 ? 0 : 1 })); i = j - 1; continue; }
    }
    const b = !fenced ? l.match(/^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/) : null;
    if (b) c.lines.push({ text: strip(b[3]), level: Math.min(1, Math.floor(b[1].replace(/\t/g, '  ').length / 2)) });
    else c.lines.push({ text: fenced ? l.trimEnd() : strip(l), level: 0 });
  }
  const real = slides.filter((s) => s.title || s.lines.length);
  if (real.length > 1 && firstLevel === 1 && real[0].lines.length <= 2) real[0].lead = true;
  // keep every slide readable: long bullet lists continue on another slide
  const out: Slide[] = [];
  for (const s of real) {
    const per = 7; if (s.lines.length <= per + 1 || s.lead) { out.push(s); continue; }
    for (let k = 0; k < s.lines.length; k += per) out.push({ title: k ? `${s.title || 'Slide'} (cont.)` : s.title, lines: s.lines.slice(k, k + per) });
  }
  return out.length ? out : [{ title: 'Untitled', lines: [] }];
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const W = 12192000; const H = 6858000;
const box = (id: number, name: string, x: number, y: number, cx: number, cy: number, paras: string, anchor: 't' | 'ctr' | 'b' = 't') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras || '<a:p><a:endParaRPr lang="en-US"/></a:p>'}</p:txBody></p:sp>`;
const bar = (id: number, x: number, y: number, cx: number, cy: number, color: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
const run = (t: string, sz: number, color: string, bold = false) => `<a:r><a:rPr lang="en-US" sz="${sz}"${bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xe(t)}</a:t></a:r>`;

function slideXml(s: Slide): string {
  const n = s.lines.length; const size = n <= 4 ? 2600 : n <= 6 ? 2200 : 1900;
  let shapes: string; let bg = 'FFFFFF';
  if (s.lead) {
    bg = '0F172A';
    shapes = bar(2, 914400, 3200400, 1371600, 54864, '38BDF8') + box(3, 'Title', 914400, 1371600, W - 1828800, 1737360, `<a:p>${run(s.title, 5000, 'FFFFFF', true)}</a:p>`, 'b') + box(4, 'Subtitle', 914400, 3429000, W - 1828800, 1828800, s.lines.map((l) => `<a:p><a:pPr><a:spcBef><a:spcPts val="600"/></a:spcBef></a:pPr>${run(l.text, 2400, 'CBD5E1')}</a:p>`).join(''));
  } else {
    const body = s.lines.map((l) => `<a:p><a:pPr marL="${l.level ? 742950 : 342900}" indent="-${l.level ? 285750 : 342900}"><a:spcBef><a:spcPts val="${l.level ? 300 : 900}"/></a:spcBef><a:buClr><a:srgbClr val="0EA5E9"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${l.level ? '–' : '•'}"/></a:pPr>${run(l.text, l.level ? size - 300 : size, l.level ? '475569' : '1E293B')}</a:p>`).join('');
    shapes = box(2, 'Title', 640080, 365760, W - 1280160, 960120, `<a:p>${run(s.title || ' ', 3600, '0F172A', true)}</a:p>`, 'ctr') + bar(3, 640080, 1371600, 914400, 45720, '0EA5E9') + box(4, 'Content', 640080, 1645920, W - 1280160, H - 2286000, body);
  }
  return `${XML}<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Pothub"><a:themeElements><a:clrScheme name="Pothub"><a:dk1><a:srgbClr val="1E293B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0F172A"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2><a:accent1><a:srgbClr val="0EA5E9"/></a:accent1><a:accent2><a:srgbClr val="38BDF8"/></a:accent2><a:accent3><a:srgbClr val="22C55E"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4><a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="8B5CF6"/></a:accent6><a:hlink><a:srgbClr val="0369A1"/></a:hlink><a:folHlink><a:srgbClr val="6D28D9"/></a:folHlink></a:clrScheme><a:fontScheme name="Pothub"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Pothub"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const REL = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const RELS = (inner: string) => strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`);

/** A real 16:9 .pptx deck from a Markdown outline. Opens in PowerPoint, Keynote and Google Slides. */
export function slidesToPptx(slides: Slide[]): Blob {
  const ct = 'application/vnd.openxmlformats-officedocument.presentationml';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${ct}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${ct}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${ct}.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${ct}.slide+xml"/>`).join('')}</Types>`),
    '_rels/.rels': RELS(REL('rId1', 'officeDocument', 'ppt/presentation.xml')),
    'ppt/presentation.xml': strToU8(`${XML}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': RELS(REL('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml') + REL('rId2', 'theme', 'theme/theme1.xml') + slides.map((_, i) => REL(`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`)).join('')),
    'ppt/slideMasters/slideMaster1.xml': strToU8(`${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': RELS(REL('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml') + REL('rId2', 'theme', '../theme/theme1.xml')),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(`${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': RELS(REL('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')),
    'ppt/theme/theme1.xml': strToU8(THEME),
  };
  slides.forEach((s, i) => { files[`ppt/slides/slide${i + 1}.xml`] = strToU8(slideXml(s)); files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = RELS(REL('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')); });
  return pack(files, `${ct}.presentation`);
}
export const markdownToPptx = (md: string) => slidesToPptx(slidesFrom(md));
