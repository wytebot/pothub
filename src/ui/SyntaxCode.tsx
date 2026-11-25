import type { ReactNode } from 'react';

export function SyntaxCode({ code }: { code: string }) {
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|`(?:\\.|[^`])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:const|let|var|function|return|if|else|for|while|class|extends|import|from|export|default|async|await|try|catch|throw|new|type|interface|public|private|static|true|false|null|undefined|void|boolean|string|number|switch|case|break|continue|this|super)\b|\b\d+(?:\.\d+)?\b)/g;
  const nodes: ReactNode[] = []; let last = 0; let match: RegExpExecArray | null; let key = 0;
  while ((match = pattern.exec(code))) {
    if (match.index > last) nodes.push(code.slice(last, match.index));
    const value = match[0];
    const cls = /^(\/\/|\/\*|<!--)/.test(value) ? 'tok-comment' : /^<\/?[A-Za-z]/.test(value) ? 'tok-tag' : /^['"`]/.test(value) ? 'tok-string' : /^\d/.test(value) ? 'tok-number' : 'tok-keyword';
    nodes.push(<span className={cls} key={key++}>{value}</span>); last = pattern.lastIndex;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return <pre className="syntax-code"><code>{nodes}</code></pre>;
}
