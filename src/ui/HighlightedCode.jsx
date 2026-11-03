import React, { useEffect, useState } from 'react';
import 'highlight.js/styles/github-dark.css';

const LANGUAGE_LOADERS = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  json: () => import('highlight.js/lib/languages/json'),
  bash: () => import('highlight.js/lib/languages/bash'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  python: () => import('highlight.js/lib/languages/python'),
  java: () => import('highlight.js/lib/languages/java'),
  sql: () => import('highlight.js/lib/languages/sql'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  diff: () => import('highlight.js/lib/languages/diff')
};
const aliases = {js:'javascript',ts:'typescript',sh:'bash',html:'xml',yml:'yaml',py:'python'};
let highlighterPromise;
async function getHighlighter(){
  if(!highlighterPromise) highlighterPromise=(async()=>{
    const [{default:hljs},...modules]=await Promise.all([
      import('highlight.js/lib/core'),
      ...Object.values(LANGUAGE_LOADERS).map(load=>load())
    ]);
    Object.keys(LANGUAGE_LOADERS).forEach((name,index)=>hljs.registerLanguage(name,modules[index].default));
    Object.entries(aliases).forEach(([alias,name])=>hljs.registerLanguage(alias,modules[Object.keys(LANGUAGE_LOADERS).indexOf(name)].default));
    return hljs;
  })().catch(error=>{highlighterPromise=null;throw error});
  return highlighterPromise;
}
export default function HighlightedCode({code,language=''}){
  const [html,setHtml]=useState('');
  useEffect(()=>{let active=true;getHighlighter().then(hljs=>{let value;try{const lang=aliases[language]||language;value=lang&&hljs.getLanguage(lang)?hljs.highlight(code,{language:lang}).value:hljs.highlightAuto(code).value}catch{value=String(code).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}if(active)setHtml(value)}).catch(()=>{if(active)setHtml(String(code).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'))});return()=>{active=false}},[code,language]);
  return <pre className="markdown-code"><code dangerouslySetInnerHTML={{__html:html||String(code).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}}/></pre>;
}
