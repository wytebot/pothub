import React, {useMemo, useState} from 'react';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="universal-editor-loading">Loading universal code editor…</div>
});

const LANGUAGE_ALIASES = {
  js:'javascript', jsx:'javascript', mjs:'javascript', cjs:'javascript',
  ts:'typescript', tsx:'typescript', py:'python', rb:'ruby', rs:'rust',
  go:'go', golang:'go', sh:'shell', bash:'shell', zsh:'shell',
  yml:'yaml', html:'html', htm:'html', xml:'xml', svg:'xml', md:'markdown',
  dockerfile:'dockerfile', makefile:'makefile', env:'ini', ini:'ini',
  txt:'plaintext', text:'plaintext', log:'plaintext', diff:'diff', patch:'diff',
  jsonc:'json', json5:'json', csharp:'csharp', cs:'csharp', cpp:'cpp',
  'c++':'cpp', h:'cpp', hpp:'cpp', kt:'kotlin', kts:'kotlin', swift:'swift',
  rsx:'rust', sql:'sql', graphql:'graphql', gql:'graphql', wasm:'plaintext'
};
function detectLanguage(language, filename='') {
  const raw = String(language || '').trim().toLowerCase();
  const extension = String(filename).split('.').pop()?.toLowerCase() || '';
  const value = raw || extension;
  return LANGUAGE_ALIASES[value] || value || 'plaintext';
}
function downloadText(text, filename='code.txt') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([String(text ?? '')], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename || 'code.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function UniversalCodeEditor({value='', onChange, language='text', filename='', readOnly=false, height=260, showActions=true, onCommit, commitLabel='Commit this file', ariaLabel='Universal code editor'}) {
  const [copied, setCopied] = useState(false);
  const monacoLanguage = useMemo(() => detectLanguage(language, filename), [language, filename]);
  const content = String(value ?? '');
  async function copyContent(){
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else { const el=document.createElement('textarea'); el.value=content; el.style.position='fixed'; el.style.opacity='0'; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); }
      setCopied(true); setTimeout(()=>setCopied(false), 1400);
    } catch { setCopied(false); }
  }
  return <div className="universal-code-editor" aria-label={ariaLabel}>
    {showActions && <div className="universal-editor-toolbar">
      <span className="universal-editor-language">{filename || monacoLanguage}</span>
      <div className="universal-editor-actions">
        <button type="button" className="secondary" onClick={copyContent}>{copied?'Copied':'Copy code'}</button>
        <button type="button" className="secondary" onClick={()=>downloadText(content, filename || `code.${language && language!=='text' ? language : 'txt'}`)}>Download</button>
        {onCommit && <button type="button" className="primary" onClick={onCommit}>{commitLabel}</button>}
      </div>
    </div>}
    <div className="universal-editor-surface">
      <MonacoEditor
        height={height}
        language={monacoLanguage}
        value={content}
        onChange={next => onChange?.(next ?? '')}
        theme="vs-dark"
        options={{readOnly, minimap:{enabled:false}, automaticLayout:true, scrollBeyondLastLine:false, wordWrap:'on', fontSize:13, lineNumbers:'on', folding:true, tabSize:2, insertSpaces:true, detectIndentation:true, renderLineHighlight:'gutter', scrollbar:{horizontalScrollbarSize:8,verticalScrollbarSize:8}, padding:{top:10,bottom:10}, ariaLabel}}
      />
    </div>
  </div>;
}
