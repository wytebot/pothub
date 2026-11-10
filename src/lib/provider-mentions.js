/**
 * Prompt envelope + provider mention routing.
 *
 * People write prompts in every shape: plain sentences, "@claude explain this", "/image a red fox", "model: gpt-4o",
 * a JSON body {"model":"gemini","prompt":"..."}, "ask deepseek to ...", or in another language. This module turns any of
 * those into (a) an optional task override (image / video / chat / diagnosis / repair) and (b) an ordered preference for
 * the user's OWN configured agents, so the request goes to the provider or model they named. It never invents an agent:
 * a mention that matches nothing configured is ignored and the normal routing (default agent, then fallbacks) applies.
 * Pure and dependency-free so it behaves the same in the browser, the Capacitor APK and Node tests.
 */

// alias → provider id used by provider-registry (several aliases per provider; model families resolve through the
// configured model IDs instead, so "llama", "qwen" or "kimi" work for whichever provider the user set them up on).
export const PROVIDER_ALIASES = {
  anthropic: ['anthropic', 'claude', 'sonnet', 'opus', 'haiku'],
  openai: ['openai', 'chatgpt', 'gpt', 'gpt4', 'gpt5', 'dalle', 'dall-e', 'sora'],
  gemini: ['gemini', 'google', 'bard', 'gemma', 'imagen', 'veo', 'nano banana'],
  deepseek: ['deepseek'],
  xai: ['xai', 'grok'],
  mistral: ['mistral', 'mixtral', 'codestral'],
  groq: ['groq'],
  perplexity: ['perplexity', 'sonar'],
  cohere: ['cohere', 'command r'],
  together: ['together', 'togetherai', 'together ai'],
  fireworks: ['fireworks', 'fireworks ai'],
  openrouter: ['openrouter', 'open router'],
  huggingface: ['huggingface', 'hugging face'],
  'azure-openai': ['azure'],
  stability: ['stability', 'stable diffusion', 'sdxl'],
  replicate: ['replicate'],
  fal: ['fal', 'falai', 'fal ai'],
  'black-forest-labs': ['flux', 'bfl', 'black forest labs'],
  runway: ['runway', 'runwayml'],
  luma: ['luma', 'dream machine'],
  kling: ['kling', 'kling ai'],
};

const TASKS = [
  ['image', /^(?:image|img|imagine|draw|picture|photo|art)$/],
  ['video', /^(?:video|vid|animate|clip|film)$/],
  ['chat', /^(?:chat|ask|talk|answer|explain|write)$/],
  ['diagnosis', /^(?:diagnose|diagnosis|debug|analy[sz]e|investigate)$/],
  ['repair', /^(?:fix|repair|patch|refactor)$/],
];
const taskOf = (word) => TASKS.find(([, rx]) => rx.test(String(word || '').toLowerCase()))?.[0] || '';

const KNOWN = new Set();
const norm = (v) => String(v || '').normalize('NFKC').replace(/[\u200E\u200F\u061C]/g, '').toLowerCase();
const squash = (v) => norm(v).replace(/[^a-z0-9\u00c0-\uffff]+/g, '');
const escapeRx = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Verbs that introduce "send this to <model>" in the languages PotHub already understands, plus common phrasing. */
const DIRECTIVE_VERB = '(?:use|using|used|with|via|through|on|ask|asks|asking|tell|let|have|get|try|trying|switch to|switch over to|route to|route this to|send to|send this to|run(?: this)?(?: on| with| using)?|powered by|prefer|choose|pick|from|by|usa|usar|usando|utiliza|utilizar|utilise|utiliser|avec|con|mit|benutze|verwende|com|pergunta ao|pergunte ao|demande [àa]|frag|use o|use a|\u7528|\u4f7f\u7528|\u3067|\u7528\u3057\u3066)';
const TOPICAL_TAIL = '(?!\\s*(?:api|apis|sdk|key|keys|library|package|endpoint|docs|documentation|pricing|price|cost|plan|code|tokens?|rate limits?|in\\s+(?:my|the|our|a)\\b|to\\s+(?:build|make|create|write|code|integrate|call)\\b|for\\s+(?:my|the|our)\\s+(?:app|project|website|bot)\\b))';

const knownName = (word) => {
  if (!KNOWN.size) for (const list of Object.values(PROVIDER_ALIASES)) for (const a of list) KNOWN.add(squash(a));
  const s = squash(word);
  return KNOWN.has(s) || /^(?:gpt|claude|gemini|gemma|llama|qwen|grok|mistral|deepseek|kimi|glm|o\d)/.test(s);
};

/** Split "{...}" / "key: value" / "/command" wrappers off a prompt. Returns the cleaned prompt and any hints found. */
export function parsePromptEnvelope(value) {
  const raw = String(value ?? '');
  const out = { text: raw, hints: [], task: '', model: '', provider: '', structured: false };
  const trimmed = raw.trim();
  if (!trimmed) return out;

  // 1. JSON body: {"prompt":"…","model":"…","provider":"…","task":"image"}
  if (/^[{[]/.test(trimmed) && trimmed.length < 20000) {
    try {
      const j = JSON.parse(trimmed);
      const o = Array.isArray(j) ? null : j;
      if (o && typeof o === 'object') {
        const prompt = o.prompt ?? o.message ?? o.text ?? o.input ?? o.query ?? o.content;
        const model = o.model ?? o.agent ?? o.llm;
        const provider = o.provider ?? o.vendor;
        const task = o.task ?? o.type ?? o.mode ?? o.action;
        if (typeof prompt === 'string' && prompt.trim() && (model || provider || task)) {
          if (model) { out.model = String(model); out.hints.push(String(model)); }
          if (provider) { out.provider = String(provider); out.hints.push(String(provider)); }
          out.task = taskOf(task);
          out.text = prompt.trim();
          out.structured = true;
          return out;
        }
      }
    } catch { /* not JSON: fall through and treat it as text */ }
  }

  let text = raw;
  // 2. Leading slash command: "/image a red fox", "/claude explain this", "/fix the login bug"
  const slash = text.match(/^\s*\/([a-z][a-z0-9.\-_]{1,30})(?:\s+|:\s*|$)/i);
  if (slash) {
    const word = slash[1];
    const task = taskOf(word);
    if (task) { out.task = task; text = text.slice(slash[0].length); out.structured = true; }
    else if (knownName(word)) { out.hints.push(word); text = text.slice(slash[0].length); out.structured = true; }
  }
  // 3. Header lines: "model: gpt-4o", "provider = anthropic", "task: image" at the top of the prompt
  const lines = text.split('\n');
  let consumed = 0;
  for (const line of lines.slice(0, 4)) {
    const m = line.match(/^\s*(?:[-*]\s*)?(model|provider|agent|ai|llm|task|mode)\s*[:=]\s*["'`]?([A-Za-z0-9 ._:/\-]{2,80}?)["'`]?\s*$/i);
    if (!m) break;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'task' || key === 'mode') out.task = out.task || taskOf(val);
    else { if (key === 'provider') out.provider = val; else out.model = val; out.hints.push(val); }
    consumed++; out.structured = true;
  }
  if (consumed) text = lines.slice(consumed).join('\n');
  // 4. Leading @mention or "name:" prefix: "@claude explain", "gemini: summarise", "[gpt-4o] write"
  const at = text.match(/^\s*@([A-Za-z][A-Za-z0-9.\-_]{1,40})[\s,:\-]+/);
  if (at) { out.hints.push(at[1]); text = text.slice(at[0].length); out.structured = true; }
  else {
    const pre = text.match(/^\s*[\[(]?([A-Za-z][A-Za-z0-9.\-_ ]{1,30}?)[\])]?\s*[:,\u2014\-]\s+(?=\S)/);
    if (pre && /^(?:[A-Za-z][A-Za-z0-9.\-_]*)(?: [A-Za-z0-9.\-_]+)?$/.test(pre[1])) out.hints.push(pre[1]);
  }
  out.text = text.trim() || raw.trim();
  return out;
}

/** Everything a configured agent can be called: provider id, aliases, label words and each model id. */
function namesFor(agent) {
  const provider = String(agent.provider || '').toLowerCase().replace(/[_\s]+/g, '-');
  const names = new Set();
  const add = (n, weight) => { const s = squash(n); if (s.length >= 2) names.add(`${weight}|${s}|${norm(n)}`); };
  add(provider, 2);
  for (const alias of PROVIDER_ALIASES[provider] || []) add(alias, 2);
  const label = String(agent.label || '').trim();
  if (label) { add(label, 3); for (const w of label.split(/[\s\u00b7|/\-]+/)) if (w.length >= 4 && !/^(?:agent|chat|image|video|model|default|vercel|environment)$/i.test(w)) add(w, 1); }
  for (const model of [agent.model, ...(Array.isArray(agent.models) ? agent.models : [])]) {
    const id = String(model || '').trim();
    if (!id) continue;
    add(id, 4);
    const tail = id.split('/').pop();
    if (tail !== id) add(tail, 4);
    const family = tail.replace(/-(?:latest|preview|exp|\d{4}-\d{2}-\d{2}|\d{3,})$/i, '');
    if (family !== tail) add(family, 3);
    // "claude-sonnet-4-5" is also reachable as "sonnet 4.5"; the first two dash parts are the usable family name.
    const parts = tail.split(/[-_]/);
    if (parts.length >= 2 && parts[0].length >= 3) add(`${parts[0]}${parts[1]}`, 1);
    if (parts[0].length >= 4 && !/^(?:gpt|o\d|gemini|claude|mistral|grok|command|sonar)$/.test(parts[0])) add(parts[0], 1);
  }
  return [...names].map((x) => { const [w, sq, spaced] = x.split('|'); return { weight: Number(w), squashed: sq, spaced }; });
}

const withinOne = (a, b) => {
  if (Math.abs(a.length - b.length) > 1 || a.length < 6) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** Does `candidate` (a word or phrase the user typed after a directive) name this agent? Returns a strength 0–5. */
function strength(agentNames, candidate) {
  const sq = squash(candidate);
  if (sq.length < 2) return 0;
  let best = 0;
  for (const n of agentNames) {
    if (n.squashed === sq) best = Math.max(best, 3 + n.weight * 0.5);
    else if (sq.length >= 4 && n.squashed.startsWith(sq) && n.weight >= 3) best = Math.max(best, 2);
    else if (n.squashed.length >= 6 && sq.length >= 6 && withinOne(n.squashed, sq)) best = Math.max(best, 1.5);
  }
  return best;
}

/** Candidate names the prompt directs the request to (free text patterns), in order of appearance. */
export function mentionCandidates(value, structuredHints = []) {
  const text = norm(value).slice(0, 4000);
  const found = [...structuredHints.map((h) => ({ name: h, via: 'structured' }))];
  const take = (re, via) => { for (const m of text.matchAll(re)) { const name = (m[1] || '').trim(); if (name) found.push({ name, via }); } };
  // "use claude", "ask gemini to…", "with gpt-4o", "run this on deepseek r1"
  take(new RegExp(`(?:^|[\\s,;(])${DIRECTIVE_VERB}\\s+(?:the\\s+|my\\s+|an?\\s+)?(?:(?:model|provider|agent|ai|llm|api)\\s+)?([a-z0-9][a-z0-9.\\-_/:]*(?:\\s+(?:ai|r1|v\\d|pro|flash|mini|nano|turbo|opus|sonnet|haiku|large|small|\\d(?:\\.\\d)?[a-z]?))?)(?![a-z0-9.\\-_/:])${TOPICAL_TAIL}`, 'gi'), 'verb');
  // "model: x", "provider = x"
  take(/(?:^|\s)(?:model|provider|agent|llm)\s*[:=]\s*["'`]?([a-z0-9][a-z0-9.\-_/:]*)/gi, 'kv');
  // "@claude" anywhere
  take(/(?:^|\s)@([a-z][a-z0-9.\-_]{1,40})/gi, 'at');
  return found.slice(0, 12);
}

/**
 * Reorder configured agents so the one the prompt names comes first (and its named model first within it).
 * @param {Array<{id?:string,provider:string,label?:string,model?:string,models?:string[]}>} agents the user's agents for this function
 * @param {string} promptText the raw prompt
 * @returns {{matched:boolean, agents:Array, picked:string[], reason:string}}
 */
export function routeByMention(agents, promptText) {
  const list = Array.isArray(agents) ? agents : [];
  const none = { matched: false, agents: list, picked: [], reason: 'no provider or model named in the prompt' };
  if (list.length < 1 || !String(promptText || '').trim()) return none;
  const env = parsePromptEnvelope(promptText);
  const candidates = mentionCandidates(env.structured ? `${env.hints.join(' ')} ${promptText}` : promptText, env.hints);
  if (!candidates.length) return none;
  const scored = list.map((agent, index) => {
    const names = namesFor(agent);
    let best = 0, model = '';
    for (const c of candidates) {
      const s = strength(names, c.name) + (c.via === 'structured' || c.via === 'kv' ? 0.4 : 0);
      if (s > best) best = s;
      for (const m of [agent.model, ...(Array.isArray(agent.models) ? agent.models : [])]) {
        if (m && squash(m) && squash(c.name).length >= 3 && (squash(m) === squash(c.name) || squash(m).startsWith(squash(c.name)))) { model = m; best = Math.max(best, 4.2); break; }
      }
    }
    return { agent, index, best, model };
  });
  const top = Math.max(...scored.map((r) => r.best));
  if (top < 1.5) return none;
  const winners = scored.filter((r) => r.best >= Math.max(1.5, top - 0.01));
  const first = winners.map((r) => {
    if (!r.model) return r.agent;
    const models = [r.model, ...[r.agent.model, ...(Array.isArray(r.agent.models) ? r.agent.models : [])].filter((m) => m && m !== r.model)];
    return { ...r.agent, model: r.model, models: [...new Set(models)] };
  });
  const rest = scored.filter((r) => !winners.includes(r)).map((r) => r.agent);
  return { matched: true, agents: [...first, ...rest], picked: winners.map((r) => String(r.agent.id ?? r.agent.provider)), reason: `prompt names ${winners.map((r) => r.model || r.agent.label || r.agent.provider).join(', ')}` };
}

/** Remove the wrapper (slash command, header lines, JSON envelope, leading @mention) so the model only sees the real prompt. */
export function stripTaskDirective(value) {
  const env = parsePromptEnvelope(value);
  return env.structured ? env.text : String(value ?? '');
}
