// Names for the files Pothub produces. A file is named for what it CONTAINS: "WyBuild source code",
// "pothub fixed version", "pothub auth-ui fixed", "Cover letter for the software engineer job".
// Never the first 40 letters of the request, a date stamp, "answer" or "files-2026-11-20".
// No imports, so it is cheap to test.

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A readable file name (without extension): keeps spaces and capitals, removes characters no system allows, cuts at a word. */
export function cleanName(s: string, max = 60): string {
  let t = s.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\-\s]+|[.\-\s]+$/g, '');
  if (t.length > max) { const cut = t.slice(0, max); t = (cut.includes(' ') ? cut.replace(/\s+\S*$/, '') : cut).trim(); }
  return RESERVED.test(t) ? `${t} file` : t;
}
/** The same name in lower-case-with-hyphens, for a folder inside a zip. */
export const slugName = (s: string, max = 40): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/, '');

const GENERIC_HEADING = /^(completion report|summary|overview|answer|response|report|result|results|introduction|analysis|notes?|document|untitled|solution|output|conclusion|here(?:'|’)?s .*|here is .*)$/i;
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The first real heading of a Markdown reply; a generic one ("Summary", "Completion report") says nothing about the content, so it is skipped. */
export function headingOf(md: string): string {
  for (const m of md.matchAll(/^\s*#{1,2}\s+(.+?)\s*#*\s*$/gm)) { const h = m[1].replace(/[*_`]/g, '').trim(); if (h && !GENERIC_HEADING.test(h)) return h; }
  return '';
}

/** What the person asked for, with the "please write me ... as a PDF" wrapping taken off: "Cover letter for the software engineer job at Acme". */
export function subjectFromPrompt(prompt: string, max = 50): string {
  let t = prompt.split(/[.!?\n]/).map((x) => x.trim()).find(Boolean) ?? '';
  for (let i = 0; i < 4; i++) t = t.replace(/^(?:hey|hi|hello|ok|okay|please|pls|kindly|can you|could you|would you|will you|i (?:want|need|would like|d like)(?: you)? to|help me|go ahead and|just)[\s,]+/i, '');
  t = t.replace(/^(?:write|create|make|generate|draft|build|produce|prepare|give|send|compose|put together|turn|convert|export|zip|compress|package|bundle)\s+(?:me\s+|us\s+)?(?:an?\s+|the\s+|some\s+|my\s+)?/i, '');
  t = t.replace(/[\s,]*(?:\band\s+)?(?:as|in|into|to|save(?:d)? as|export(?:ed)? (?:as|to)|download(?:ed)? as)\s+(?:an?\s+|the\s+)?(?:pdf|docx?|word|excel|xlsx|csv|zip|pptx?|powerpoint|slides?|file|document|markdown|md|txt|text|json|html)\b.*$/i, '');
  t = t.replace(/[\s,]*\band\s+(?:save|download|send|give|export|zip)\b.*$/i, '').replace(/\s+(?:please|pls)$/i, '').trim();
  if (/^(?:this|it|that|them|these|those|everything|all|that one)(?:\s+(?:file|files|project|code|one|stuff))?$/i.test(t)) return '';
  return cleanName(capital(t), max);
}

/** The best name for a single document: its own heading, else what was asked for, else a plain fallback. */
export function documentName(o: { reply?: string; prompt?: string }): string {
  return cleanName(headingOf(o.reply ?? ''), 60) || subjectFromPrompt(o.prompt ?? '') || 'Pothub document';
}

/** The first line of some Markdown as a name (for "Save as file" on an old answer). */
export function nameFromText(md: string): string {
  const h = headingOf(md); if (h) return cleanName(h, 60);
  const OPENER = /^(sure|certainly|of course|absolutely|okay|ok|great|here(?:'|’)?s|here is|here are|i(?:'|’)?ll|let me|below is|yes|no problem)\b/i;
  for (const raw of md.split('\n')) {
    const line = raw.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim();
    if (line.split(/\s+/).length >= 3 && !OPENER.test(line)) return cleanName(line.split(/[.!?:]/)[0], 50) || 'Pothub answer';
  }
  return 'Pothub answer';
}

// ---- projects: which app or project a zip is about
const ARCHIVE = /\.(zip|tar|tgz|gz|rar|7z)$/i;
const NOISE = /^(main|master|dev|develop|final|fixed|fix|copy|latest|new|old|backup|build|release|source|src|code|download|downloads|upload|archive|project|version|v?\d+[a-z]?)$/i;

/** "pothub-main-fixed__2_.zip" -> "pothub", "WyBuild.zip" -> "WyBuild": the part of an archive's name before version numbers and filler words. */
export function projectFromArchive(fileName: string): string | null {
  const stem = fileName.replace(ARCHIVE, '').replace(/\.(tar)$/i, '').replace(/\s*\(\d+\)\s*$/, '');
  const out: string[] = [];
  for (const t of stem.split(/[\s_.-]+/).filter(Boolean)) { if (NOISE.test(t)) break; out.push(t); if (out.length >= 3) break; }
  return out.length ? out.join('-') : null;
}

const TOOLS = new Set(['iphone', 'ipad', 'javascript', 'typescript', 'github', 'gitlab', 'youtube', 'whatsapp', 'powerpoint', 'linkedin', 'chatgpt', 'openai', 'deepseek', 'postgresql', 'mongodb', 'mysql', 'tiktok', 'facebook', 'wordpress', 'nodejs', 'vscode', 'photoshop', 'macbook', 'paypal', 'airbnb', 'onedrive', 'gmail', 'ios', 'macos', 'ipados', 'watchos', 'tvos', 'devops', 'reactjs', 'nextjs', 'vuejs', 'nodejs', 'nestjs', 'expressjs', 'fastapi', 'graphql', 'sqlite', 'mariadb', 'dynamodb', 'tailwindcss', 'sveltekit', 'reactnative', 'openai', 'notion']);
/** An app name written in the request: "called WyBuild", or a CamelCase word such as WyBuild or myApp. */
export function namedInPrompt(prompt: string): string | null {
  const named = /\b(?:called|named)\s+["“']?([A-Za-z][\w.-]{1,30})/i.exec(prompt)?.[1]?.replace(/[.-]+$/, '');
  return named && !TOOLS.has(named.toLowerCase()) ? named : null;
}
export function camelInPrompt(prompt: string): string | null {
  for (const m of prompt.matchAll(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+|[a-z]+[A-Z][A-Za-z0-9]+)\b/g)) if (!TOOLS.has(m[1].toLowerCase())) return m[1];
  return null;
}
export const projectFromPrompt = (prompt: string): string | null => namedInPrompt(prompt) ?? camelInPrompt(prompt);

const NEW_THING = /\b(?:build|create|make|generate|develop|code|write|design)\s+(?:me\s+)?(?:an?\s+|the\s+|my\s+)?((?:[\w-]+\s+){0,3}?[\w-]+)\s+(app|application|website|web ?site|site|game|bot|api|tool|extension|plugin|dashboard|landing page|calculator|portfolio|store|platform)\b/i;
const FILLER = new Set(['simple', 'small', 'new', 'basic', 'complete', 'full', 'nice', 'modern', 'beautiful', 'quick', 'good', 'great', 'whole', 'entire', 'a', 'an', 'the', 'my', 'me', 'it']);
/** "build me a todo app" -> "todo app" */
export function newThingFromPrompt(prompt: string): string | null {
  const m = NEW_THING.exec(prompt); if (!m) return null;
  const words = m[1].split(/\s+/).filter((w) => !FILLER.has(w.toLowerCase())); if (!words.length) return null; const noun = m[2].toLowerCase().replace('web site', 'website');
  return cleanName([...words.slice(-2), noun].join(' '), 40) || null;
}

// ---- what was done: "fixed", "auth-ui fixed", "source code"
const FIX = 'fix|repair|debug|patch|resolve|correct|solve';
const UPDATE = 'update|upgrade|improve|enhance|refactor|optimi[sz]e|redesign|rewrite|rework|revamp';
const ADD = 'add|implement|integrate';
const WIRE = 'wire|rewire|connect|hook up|link|integrate';
const GENERIC_AREA = new Set(['app', 'apps', 'project', 'projects', 'code', 'codebase', 'bug', 'bugs', 'issue', 'issues', 'error', 'errors', 'problem', 'problems', 'everything', 'it', 'them', 'file', 'files', 'website', 'site', 'thing', 'things', 'whole', 'entire', 'all', 'this', 'that', 'these', 'those', 'zip', 'source', 'version', 'application', 'script']);
const STOP = new Set(['in', 'on', 'of', 'for', 'and', 'so', 'because', 'that', 'which', 'to', 'with', 'please', 'then', 'zip', 'send', 'give', 'download', 'as', 'from', 'by', 'using', 'but', 'since', 'when', 'while', 'it', 'them', 'inside', 'within', 'into', 'about', 'i', 'we', 'you']);
const DET = /^(?:the|my|our|this|these|that|those|all|any|some|a|an)\s+/i;

function areaFrom(text: string, avoid: string): string | null {
  let seg = text.split(/[,.;!?\n]/)[0].trim(); while (DET.test(seg)) seg = seg.replace(DET, '');
  const words: string[] = [];
  for (const w of seg.split(/\s+/).filter(Boolean)) { if (words.length && STOP.has(w.toLowerCase())) break; if (STOP.has(w.toLowerCase())) return null; words.push(w.replace(/[^\w-]/g, '')); if (words.length >= 3) break; }
  const clean = words.filter(Boolean); if (!clean.length || clean.every((w) => GENERIC_AREA.has(w.toLowerCase()))) return null;
  const area = clean.join('-').toLowerCase(); return area === avoid.toLowerCase() || area.length > 30 ? null : area;
}
/** The part of the app the request is about: "fix the auth ui in pothub" -> "auth-ui". */
function areaOf(prompt: string, verbs: string, project: string): string | null {
  const m = new RegExp(`\\b(?:${verbs})(?:e?s|e?d|ing)?\\s+(.*)$`, 'i').exec(prompt); if (!m) return null;
  const direct = areaFrom(m[1], project); if (direct) return direct;
  const where = /\b(?:in|on|of|for|inside|within)\s+(.*)$/i.exec(m[1]); while (where && DET.test(where[1])) where[1] = where[1].replace(DET, '');
  return where ? areaFrom(where[1], project) : null;
}

/** What the files are: "auth-ui fixed", "fixed version", "source code"; null when the request says nothing about it. */
export function describeWork(prompt: string, project = ''): string | null {
  const p = prompt.replace(/\s+/g, ' ');
  if (new RegExp(`\\b(?:${FIX})(?:e?s|e?d|ing)?\\b`, 'i').test(p)) { const a = areaOf(p, FIX, project); return a ? `${a} fixed` : 'fixed version'; }
  if (new RegExp(`\\b(?:${UPDATE})(?:e?s|e?d|ing)?\\b`, 'i').test(p)) { const a = areaOf(p, UPDATE, project); return a ? `${a} updated` : 'updated version'; }
  if (new RegExp(`\\b(?:${WIRE})(?:e?s|e?d|ing)?\\b`, 'i').test(p)) { const a = areaOf(p, WIRE, project); return a ? `${a} wired` : 'wired version'; }
  if (new RegExp(`\\b(?:${ADD})(?:e?s|e?d|ing)?\\b`, 'i').test(p)) { const a = areaOf(p, ADD, project); if (a) return `${a} added`; }
  if (/\b(source code|codebase|source|whole project|entire project|full project|code files|project files)\b/i.test(p) || NEW_THING.test(p) || /\b(?:build|rebuild|develop|finish|complete|implement|code|scaffold)\s+(?:it|this|that|everything|the (?:whole |entire |full )?(?:app|project|thing|site|website|codebase))\b/i.test(p)) return 'source code';
  return null;
}

export interface NameInput { prompt: string; reply?: string; /** the files the person attached */ inputs?: { name: string }[]; }

/** The name for a zip (without ".zip"): the app or project, then what is inside. */
export function bundleName(o: NameInput): string {
  const archive = (o.inputs ?? []).find((f) => ARCHIVE.test(f.name)); const fromArchive = archive ? projectFromArchive(archive.name) : null;
  const heading = headingOf(o.reply ?? ''); const short = heading && heading.length <= 28 && heading.split(/\s+/).length <= 3 ? heading : '';
  const camel = camelInPrompt(o.prompt); const thing = newThingFromPrompt(o.prompt);
  const project = fromArchive ?? namedInPrompt(o.prompt) ?? (thing && camel && thing.includes(camel) ? camel : thing) ?? camel ?? short;
  const work = describeWork(o.prompt, project);
  if (project && work) return cleanName(`${project} ${work}`);
  if (project) return cleanName(`${project} files`);
  if (work) return cleanName(capital(work));
  const doc = documentName({ reply: o.reply, prompt: o.prompt });
  return doc === 'Pothub document' ? 'Pothub files' : doc;
}

/** The name for one produced file (without extension). A single attached file that is being changed keeps its own name: "App fixed version". */
export function fileName(o: NameInput): string {
  const one = (o.inputs ?? []).length === 1 ? o.inputs![0].name : '';
  if (one && !ARCHIVE.test(one)) { const work = describeWork(o.prompt); if (work) return cleanName(`${one.replace(/\.[^.]+$/, '')} ${work}`); }
  return documentName({ reply: o.reply, prompt: o.prompt });
}

// ---- files made on the device from the person's own files (no model involved)
const stem = (n: string) => n.replace(/\.[^.]+$/, '');
function commonPrefix(names: string[]): string {
  const low = names.map((n) => n.toLowerCase()); let i = 0;
  while (i < low[0].length && low.every((n) => n[i] === low[0][i])) i++;
  return names[0].slice(0, i).replace(/[\s_.\-()\d]+$/, '').trim();
}
/** A name for several files taken together: their shared start ("Invoice merged"), or "first and N more files". */
export function groupName(names: string[], thing = 'files'): string {
  const stems = names.map(stem).filter(Boolean); if (!stems.length) return `Pothub ${thing}`;
  if (stems.length === 1) return cleanName(stems[0]);
  const common = commonPrefix(stems); if (common.length >= 3) return cleanName(`${common} ${thing}`);
  return cleanName(stems.length === 2 ? `${stems[0]} and ${stems[1]} ${thing}` : `${stems[0]} and ${stems.length - 1} more ${thing}`);
}

/** A name for a short piece of code a person saves from a reply: a file name in its first comment, a <title>, or what it declares. */
export function snippetName(lang: string, code: string, ext: string): string {
  const first = code.split('\n').find((l) => l.trim()) ?? '';
  const hint = /^\s*(?:\/\/|#|\/\*|<!--|--)\s*(?:file(?:name)?:?\s*)?([\w@.\-/]+\.[A-Za-z0-9]{1,6})\b/.exec(first)?.[1];
  if (hint) return cleanName(hint.split('/').pop() ?? '', 60);
  const title = /<title[^>]*>([^<]{2,60})<\/title>/i.exec(code)?.[1]; if (title) return `${cleanName(title)}.${ext}`;
  const decl = /\b(?:function|class|interface|def|struct|fn|func|enum|type)\s+([A-Za-z_]\w{2,})/.exec(code)?.[1] ?? /\b(?:const|let|var)\s+([A-Za-z_]\w{2,})\s*=\s*(?:\(|async|function|class)/.exec(code)?.[1];
  return `${decl ? cleanName(decl) : `${(lang || 'code').toLowerCase()} snippet`}.${ext}`;
}
