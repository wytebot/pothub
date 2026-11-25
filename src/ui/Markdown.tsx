import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '../agent/markdown';
import { platform } from '../platform';
import { snippetName } from '../agent/fileNames';
import { SyntaxCode } from './SyntaxCode';

const EXT: Record<string, string> = { js: 'js', javascript: 'js', jsx: 'jsx', ts: 'ts', typescript: 'ts', tsx: 'tsx', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', csv: 'csv', sql: 'sql', bash: 'sh', sh: 'sh', shell: 'sh', java: 'java', kotlin: 'kt', swift: 'swift', go: 'go', rust: 'rs', c: 'c', cpp: 'cpp', csharp: 'cs', php: 'php', ruby: 'rb', yaml: 'yml', yml: 'yml', xml: 'xml', md: 'md', markdown: 'md', dart: 'dart' };

function Code({ lang, code }: { lang: string; code: string }) {
  const [done, setDone] = useState('');
  const flash = (m: string) => { setDone(m); setTimeout(() => setDone(''), 1600); };
  const copy = async () => { try { await navigator.clipboard.writeText(code); flash('Copied'); } catch { flash('Press and hold to copy'); } };
  const save = async () => { const ext = EXT[lang.toLowerCase()] ?? 'txt'; if ((await platform.saveFile(new Blob([code], { type: 'text/plain' }), snippetName(lang, code, ext))) === 'saved') flash('Saved'); };
  return (
    <div className="md-code">
      <div className="md-code-bar"><span>{lang || 'code'}</span><span className="md-code-actions"><button onClick={() => void copy()}>{done || 'Copy'}</button><button onClick={() => void save()}>Save</button></span></div>
      <SyntaxCode code={code} />
    </div>
  );
}

const inline = (xs: Inline[]): ReactNode => xs.map((x, i) => {
  let n: ReactNode = x.s;
  if (x.code) n = <code>{n}</code>;
  if (x.b) n = <strong>{n}</strong>;
  if (x.i) n = <em>{n}</em>;
  if (x.href) {
    const iconOnly = x.s === '🌐';
    const host = (() => { try { return new URL(x.href).hostname; } catch { return ''; } })();
    n = <a href={x.href} target="_blank" rel='noopener noreferrer' aria-label={iconOnly ? `Open ${host}` : undefined} title={iconOnly ? host : undefined}>{iconOnly ? <img className="citation-favicon" src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=16`} alt="" loading="lazy" /> : n}</a>;
  }
  return <Fragment key={i}>{n}</Fragment>;
});

function render(b: Block, i: number): ReactNode {
  switch (b.t) {
    case 'h': { const L = (`h${Math.min(b.level + 1, 6)}`) as 'h2'; return <L key={i} className="md-h">{inline(b.inl)}</L>; }
    case 'p': return <p key={i}>{inline(b.inl)}</p>;
    case 'quote': return <blockquote key={i}>{inline(b.inl)}</blockquote>;
    case 'hr': return <hr key={i} />;
    case 'code': return <Code key={i} lang={b.lang} code={b.code} />;
    case 'list': return <div key={i} className="md-list">{b.items.map((it, k) => <div key={k} className="md-li" style={{ paddingLeft: `${it.depth * 18}px` }}><span className="md-bullet" aria-hidden="true">{it.ordered ? `${it.num}.` : '•'}</span><span>{inline(it.inl)}</span></div>)}</div>;
    case 'table': return <div key={i} className="md-table"><table><thead><tr>{b.head.map((c, k) => <th key={k}>{inline(c)}</th>)}</tr></thead><tbody>{b.rows.map((r, k) => <tr key={k}>{b.head.map((_, j) => <td key={j}>{inline(r[j] ?? [])}</td>)}</tr>)}</tbody></table></div>;
  }
}

/** Renders a model's Markdown reply as real headings, lists, tables and code blocks. Everything is built as React elements, so nothing from the model is ever inserted as HTML. */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="md">{blocks.map(render)}</div>;
}
