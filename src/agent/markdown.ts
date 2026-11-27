/** A small, dependency-free Markdown reader shared by the chat view and the Word / PDF exporters. It never produces HTML, only a typed tree. */
export interface Inline { s: string; b?: boolean; i?: boolean; code?: boolean; href?: string; }
export interface ListItem { inl: Inline[]; depth: number; ordered: boolean; num: number; }
export type Block =
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; inl: Inline[] }
  | { t: 'p'; inl: Inline[] }
  | { t: 'list'; items: ListItem[] }
  | { t: 'code'; lang: string; code: string }
  | { t: 'quote'; inl: Inline[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

const TOKEN_SRC = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*|(?<![A-Za-z0-9])_[^_\s][^_\n]*?_(?![A-Za-z0-9]))|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))|(https?:\/\/[^\s<>)]+[^\s<>).,;:!?])/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []; let last = 0; let m: RegExpExecArray | null; const TOKEN = new RegExp(TOKEN_SRC.source, 'g'); // a fresh regex per call: bold/italic recurse
  const plain = (s: string) => { if (s) out.push({ s }); };
  while ((m = TOKEN.exec(src))) {
    plain(src.slice(last, m.index)); const tok = m[0];
    if (m[1]) out.push({ s: tok.slice(1, -1), code: true });
    else if (m[2]) for (const x of parseInline(tok.slice(2, -2))) out.push({ ...x, b: true });
    else if (m[3]) for (const x of parseInline(tok.slice(1, -1))) out.push({ ...x, i: true });
    else if (m[4]) { const k = tok.indexOf(']('); out.push({ s: tok.slice(1, k), href: tok.slice(k + 2, -1) }); }
    else out.push({ s: tok, href: tok });
    last = m.index + tok.length;
  }
  plain(src.slice(last)); return out;
}

const isRule = (l: string) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-') && (l.includes('|') || /^\s*:?-{3,}/.test(l)) && l.includes('|');
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const LIST = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'); const out: Block[] = []; let i = 0;
  const startsBlock = (l: string, next?: string) => /^\s{0,3}(#{1,6})\s/.test(l) || /^\s{0,3}(```|~~~)/.test(l) || isRule(l) || LIST.test(l) || /^\s{0,3}>/.test(l) || (l.includes('|') && next !== undefined && isSep(next));
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const fence = l.match(/^\s{0,3}(```|~~~)\s*([\w+#.-]*)/);
    if (fence) { const code: string[] = []; i++; while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]); i++; out.push({ t: 'code', lang: fence[2] ?? '', code: code.join('\n') }); continue; }
    const h = l.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { out.push({ t: 'h', level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6, inl: parseInline(h[2]) }); i++; continue; }
    if (isRule(l)) { out.push({ t: 'hr' }); i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(l).map(parseInline); const rows: Inline[][][] = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]).map(parseInline));
      out.push({ t: 'table', head, rows }); continue;
    }
    if (/^\s{0,3}>/.test(l)) { const q: string[] = []; while (i < lines.length && /^\s{0,3}>/.test(lines[i])) q.push(lines[i++].replace(/^\s{0,3}>\s?/, '')); out.push({ t: 'quote', inl: parseInline(q.join(' ')) }); continue; }
    if (LIST.test(l)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST);
        if (m) { const ordered = /\d/.test(m[2]); items.push({ inl: parseInline(m[3]), depth: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), ordered, num: ordered ? parseInt(m[2], 10) : 0 }); i++; }
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { const it = items[items.length - 1]; it.inl = [...it.inl, { s: ' ' }, ...parseInline(lines[i].trim())]; i++; }
        else if (!lines[i].trim() && i + 1 < lines.length && LIST.test(lines[i + 1])) i++;
        else break;
      }
      out.push({ t: 'list', items }); continue;
    }
    const para: string[] = [l.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++].trim());
    out.push({ t: 'p', inl: parseInline(para.join(' ')) });
  }
  return out;
}

export const plainText = (inl: Inline[]) => inl.map((x) => x.s).join('');

/** First fenced block in a reply, or the whole reply with any wrapping fence removed. Used when the person asked for a raw CSV / JSON / HTML file. */
export function rawFromReply(reply: string, langs: string[]): string {
  const m = reply.match(new RegExp('```(?:' + langs.join('|') + ')?[^\\n]*\\n([\\s\\S]*?)```', 'i'));
  return (m ? m[1] : reply).replace(/^\s*```[^\n]*\n?/, '').replace(/\n?```\s*$/, '').trim();
}
