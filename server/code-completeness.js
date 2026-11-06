import vm from 'node:vm';

export const CODE_COMPLETENESS_RULES = [
  'CODE OUTPUT RULES: when you write code, deliver complete, runnable code.',
  'Never use placeholders such as "...", "// rest of code", "unchanged" or TODO stubs; when changing a file, return the whole file unless the user asked for a snippet.',
  'Put each file in its own fenced block with the right language tag and the file path on the line above it, and include every import and dependency it needs.',
  'Before answering, check syntax, bracket balance, variable names, async/await usage and edge cases. Do not claim you ran or tested the code.',
  'If the answer is long, finish the code first and keep the explanation short.'
].join(' ');

export const CONTINUE_PROMPT = 'Continue exactly where your previous message stopped. Do not repeat anything, add no preface or commentary, and if you were inside a code block keep writing inside it without reopening the fence.';

/** Close a code fence left open by a cut-off reply. */
export function closeOpenFence(text) {
  const fences = (String(text).match(/^[ \t]*```/gm) || []).length;
  if (fences % 2 === 0) return text;
  return `${text}${String(text).endsWith('\n') ? '' : '\n'}\`\`\``;
}

const PLACEHOLDER = /(?:^|\n)[ \t]*(?:\/\/|#|\/\*|<!--|--)[ \t]*(?:\.{3}|…|(?:rest|remaining|other|existing|previous|same|unchanged)\b[^\n]{0,60}\b(?:code|unchanged|here|omitted|as before|same)\b|your code here|add (?:your )?code here|implementation (?:goes )?here|todo:? implement)/i;
const BARE_ELLIPSIS = /(?:^|\n)[ \t]*\.{3}[ \t]*(?:\n|$)/;
const JS_LANG = /^(?:js|javascript|node|mjs|cjs)$/i;

function blocks(text) {
  const out = [];
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(text)))) out.push({ lang: (m[1] || '').toLowerCase(), code: m[2], n: out.length + 1 });
  return out;
}

function jsSyntaxError(code) {
  if (/^\s*(?:import|export)\s/m.test(code)) return ''; // ES modules cannot be checked with vm.Script
  if (/return\s*\(\s*<|=>\s*\(?\s*<[A-Za-z]/.test(code)) return ''; // JSX
  for (const wrapped of [code, `(async()=>{\n${code}\n})`]) {
    try { new vm.Script(wrapped); return ''; } catch (e) { var last = e; }
  }
  return String(last?.message || 'syntax error').slice(0, 120);
}

/** Problems an automatic review can detect without running anything: invalid JSON/JS and placeholder code. */
export function findCodeIssues(text, limit = 3) {
  const issues = [];
  for (const b of blocks(text)) {
    if (issues.length >= limit) break;
    const placeholder = PLACEHOLDER.test(b.code) || (!/^(?:py|python|pyi)$/.test(b.lang) && b.lang && BARE_ELLIPSIS.test(b.code));
    if (placeholder) { issues.push({ n: b.n, lang: b.lang, kind: 'placeholder', message: `code block ${b.n} contains placeholders instead of full code` }); continue; }
    if (b.lang === 'json') {
      if (/\/\/|\/\*/.test(b.code)) continue;
      try { JSON.parse(b.code); } catch (e) { issues.push({ n: b.n, lang: 'json', kind: 'syntax', message: `code block ${b.n} is invalid JSON (${String(e.message).slice(0, 80)})` }); }
    } else if (JS_LANG.test(b.lang)) {
      const err = jsSyntaxError(b.code);
      if (err) issues.push({ n: b.n, lang: b.lang, kind: 'syntax', message: `code block ${b.n} has a JavaScript syntax error (${err})` });
    }
  }
  return issues;
}

export const repairPrompt = (issues) => `An automatic check of your previous answer found: ${issues.map((i) => i.message).join('; ')}. Reply with ONLY the corrected, complete code block(s) for those blocks — full code, no placeholders, no explanation.`;

/**
 * Drive a streamed chat turn to a complete answer.
 *  - lowers max tokens and retries when the provider rejects the limit,
 *  - continues automatically when the reply was cut off by the output limit,
 *  - closes a code fence that was left open,
 *  - runs one correction pass when invalid JSON/JS or placeholders are found.
 * runTurn({history,maxTokens,onToken}) -> {text, finish:'length'|''}
 */
export async function runCompleteChat({ runTurn, onToken, signal, maxTokens = 8192, maxContinuations = 3, repair = true, deadlineAt = Infinity }) {
  let tokens = maxTokens, full = '', history = [], continuations = 0, lastFinish = '';
  const turn = async (emit) => {
    for (;;) {
      try { return await runTurn({ history, maxTokens: tokens, onToken: emit }); }
      catch (e) { if (e?.tokenLimit && tokens > 1024) { tokens = Math.max(1024, Math.floor(tokens / 2)); continue; } throw e; }
    }
  };
  for (;;) {
    let r;
    try { r = await turn(onToken); }
    catch (e) { if (history.length && /returned no text/i.test(String(e?.message || ''))) break; throw e; }
    full += r.text; lastFinish = r.finish || '';
    if (lastFinish === 'length' && continuations < maxContinuations && !signal?.aborted && deadlineAt - Date.now() > 12000) {
      continuations++; history = [{ role: 'assistant', text: full }, { role: 'user', text: CONTINUE_PROMPT }]; continue;
    }
    break;
  }
  const closed = closeOpenFence(full);
  if (closed !== full) { onToken(closed.slice(full.length)); full = closed; }
  if (lastFinish === 'length') { const note = '\n\n_⚠ The reply was cut off by the output or time limit. Reply "continue" to get the rest._'; onToken(note); full += note; return full; }
  if (repair && !signal?.aborted && deadlineAt - Date.now() > 15000) {
    const issues = findCodeIssues(full);
    if (issues.length) {
      history = [{ role: 'assistant', text: full }, { role: 'user', text: repairPrompt(issues) }];
      let fix = '';
      try { const r = await turn((t) => { fix += t; }); fix = fix || r.text; } catch { fix = ''; }
      if (fix.trim()) {
        const sep = `\n\n---\n**Corrected version** — automatic check found: ${issues.map((i) => i.message).join('; ').slice(0, 220)}\n\n`;
        const body = closeOpenFence(fix);
        onToken(sep + body); full += sep + body;
      }
    }
  }
  return full;
}
