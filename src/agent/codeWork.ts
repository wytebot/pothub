// Recognises requests to DO code work ("fix it", "debug the code", "wire it", "build the app") so MonyGist starts the
// analysis, writes the corrected or new code, and hands it back as a zip, instead of chatting about it or, for a short
// message with nothing attached, mistaking it for a picture request. No imports, so it is cheap to test.
//
// Short messages like "fix it" only count when there is something to fix: files attached, code in the recent chat,
// or code/an error pasted in the message. "Build the app" needs nothing, because it can be built from the request.

export type CodeTask = 'fix' | 'debug' | 'wire' | 'build' | 'upgrade';
export interface CodeCtx {
  /** something was attached with the + button */ hasFiles?: boolean;
  /** the recent conversation holds code, a project, a bug or an error */ afterCode?: boolean;
  /** the last reply offered to make changes ("Want me to fix these?"), so "do it" / "go ahead" means yes */ offered?: boolean;
}
export interface CodeWork { task: CodeTask; /** why it counted */ via: 'phrase' | 'confirm'; }

const CODE_TOKENS = /```|=== FILE:|\b(?:import\s+[\w{*].*\s+from\s+['"]|export\s+(?:default|const|function)|function\s+\w+\s*\(|const\s+\w+\s*=|def\s+\w+\s*\(|class\s+\w+|package\.json|npm\s+(?:run|install)|<\/?(?:div|span|html|body|script)\b|SELECT\s+.+\s+FROM|public\s+(?:static\s+)?(?:void|class)|console\.log|return\s*\(|=>\s*[{(])/;
const ERROR_TOKENS = /\b(?:Error:|TypeError|ReferenceError|SyntaxError|Exception|Traceback|stack trace|cannot find module|is not defined|undefined is not|TS\d{4}|ENOENT|npm ERR|build failed|failed to compile|segmentation fault|null pointer|404|500)\b|\bat\s+\S+\s+\(.+:\d+:\d+\)/i;
const CODE_WORDS = /\b(?:code|codebase|app|application|project|repo|repository|bug|bugs|error|errors|build|script|function|component|api|backend|frontend|server|database|website|site|page|css|html|react|typescript|javascript|python|node|android|ios|firebase|vercel|vite)\b/i;

/** Does the recent conversation concern code? Looks at the last few turns, newest first. */
export function codeContext(history: { role: 'user' | 'assistant'; text: string }[], o: { hasFiles?: boolean } = {}): CodeCtx {
  const recent = history.slice(-6);
  const afterCode = recent.some((t) => CODE_TOKENS.test(t.text) || ERROR_TOKENS.test(t.text) || (t.role === 'user' && CODE_WORDS.test(t.text)));
  const last = [...history].reverse().find((t) => t.role === 'assistant')?.text.slice(-500) ?? '';
  const offered = afterCode && /\b(?:would you like|do you want|want me to|shall i|should i|let me know if|i can (?:also )?(?:fix|apply|build|implement|wire|create|generate|provide|send|package|make)|if you(?:'|’)?d like|if you would like|next steps?)\b/i.test(last);
  return { hasFiles: !!o.hasFiles, afterCode, offered };
}

// ---- the wording
const POLITE = /^(?:(?:please|pls|plz|plss+|kindly|hey|hi|hello|ok|okay|alright|yes|yeah|yep|yup|sure|now|then|so|just|also|and|but|can you|could you|would you|will you|can u|could u|can ya|you can|you should|you need to|you must|i need you to|i want you to|i(?:'|’)?d like you to|i would like you to|i(?:'|’)?ll need you to|help me(?: to)?|let(?:'|’)?s|lets|let us|go ahead and|go on and|go and|time to|start by|try to|try and|okay so|first)\b[\s,:;-]*)+/i;
const TAIL = /[\s,]*(?:for me|please|pls|plz|now|asap|thanks|thank you|thx|again|properly|correctly|completely|fully|entirely|totally|for real|right now|quickly|quick|immediately|today|already|too|once and for all|for good|and zip it|and send it|and give it to me)[\s.!?]*$/i;

const PRON = '(?:it|this|that|them|these|those|everything|all|all of (?:it|them|that|this)|the whole thing|the rest|things|stuff|all that|the lot|up)';
const NON_CODE = /\b(?:typos?|grammar|spelling|sentences?|paragraphs?|essay|wording|punctuation|resume|cv|cover letter|letter|email|speech|poem|story|translation|caption|schedule|sleep|diet|tap|sink|car|bike|tyre|tire|phone screen|relationship|marriage|habit|muscle|confidence|brand|business|career|team|house|hair|skin|credit|score|budget|taxes?)\b/i;
/** A picture, video or logo is the subject: not code work unless code words are there too ("fix the image upload bug"). */
const MEDIA_WORD = /\b(?:photos?|photograph|pictures?|images?|selfie|portrait|logo|poster|video|videos|drawing|illustration|artwork|wallpaper|thumbnail|avatar|sticker)\b/i;
const CODE_STRONG = /\b(?:code|codebase|bugs?|errors?|function|script|component|api|backend|frontend|build|project|repo|repository|server|database|css|html|react|typescript|javascript|python|upload|endpoint)\b/i;
const MEDIA_AFTER = /\b(?:app|application|website|site)\s+(?:icon|logo|poster|image|picture|photo|video|banner|mockup|illustration|wallpaper|sticker|screenshot|name|idea)\b|\b(?:icon|logo|poster|image|picture|photo|video|banner)\b/i;
const NAMES_CODE = /\b(?:code|codes|codebase|source(?: code)?|app|apps|application|applications|project|projects|repo|repository|website|web ?site|site|web ?app|bug|bugs|error|errors|issue|issues|crash|crashes|build|script|scripts|function|functions|component|components|module|modules|api|apis|backend|frontend|front-end|back-end|server|database|db|auth|authentication|login|signup|ui|ux|css|html|file|files|program|software|plugin|extension|bot|game|dashboard|config|routes?|endpoints?|handlers?|hooks?|tests?|pipeline|page|pages|screen|screens|form|forms|layout|navbar|menu|button|buttons|pothub|wybuild)\b/i;
const BUILD_OBJECT = /\b(?:app|apps|application|applications|project|projects|website|web ?site|site|web ?app|software|platform|system|dashboard|game|bot|chatbot|backend|frontend|front-end|back-end|api|codebase|repo|repository|saas|portal|store|shop|extension|plugin|program|tool|whole thing|full thing|entire thing)\b/i;

const FIX_V = /^(?:fix|fixe|fixx|repair|correct|patch|resolve|solve|sort(?: it)? out|squash|troubleshoot|trouble ?shoot|diagnose)\b/i;
const DEBUG_V = /^(?:de-?bug|trace|investigate|find (?:and (?:fix|repair) )?(?:the |any |all |every )?(?:bugs?|errors?|issues?|problems?|crash(?:es)?|faults?|mistakes?))\b/i;
const WIRE_V = /^(?:wire|re-?wire|connect|hook|link|plug|tie|integrate|glue|stitch|join)\b/i;
const BUILD_V = /^(?:build|rebuild|develop|code|implement|scaffold|create|make|generate|write|finish|complete|assemble|set ?up|bootstrap|spin up|continue building|keep building|start building|start coding|begin building|start developing|carry on building)\b/i;
const UPGRADE_V = /^(?:improve|upgrade|optimi[sz]e|refactor|clean up|polish|modernize|modernise|rewrite|redesign|restructure|rework|revamp|update|harden|secure|speed up|tidy up|reorgani[sz]e)\b/i;
const MAKE_WORK = /^(?:make|get) (?:it|this|that|them|everything|the (?:app|code|project|site|website|build|server|script|program)|my (?:app|code|project|site|website|build|script)) (?:to )?(work|working|run|running|compile|compiling|build|building|start|starting|load|loading|pass|passing|functional|functioning)\b/i;
const MAKE_BETTER = /^make (?:it|this|that|them|everything|the (?:app|code|project|site|website)) (?:much |way |a lot )?(?:better|faster|stable|more stable|responsive|secure|safer|cleaner|production[- ]ready|ready for production|professional|robust|scalable)\b/i;
const DELIVER = /^(?:send|give|drop|hand|get|let me have|show|i (?:want|need)|i(?:'|’)?d like)\b.*\b(?:me|us)?\s*(?:the |a |an |your |my )?(?:fixed|corrected|repaired|updated|working|complete|full|final|improved|debugged|rebuilt|wired)\s+(?:code|version|files?|project|app|source|build|copy|zip|codebase|program)\b/i;
const BROKEN_SUBJECT = /^(?:it|this|that|the (?:app|code|project|site|website|page|build|server|script|program|login|form|button|api)|my (?:app|code|project|site|website|build|script|program))\b/i;
const BROKEN_STATE = /\b(?:(?:is|are|was|were|keeps?|still|just)\s+(?:not\s+)?(?:working|broken|crashing|failing|buggy|stuck|freezing|erroring)|isn(?:'|’)?t working|not working|doesn(?:'|’)?t (?:work|run|start|build|compile|load|open|respond)|won(?:'|’)?t (?:run|start|build|compile|load|open|work)|can(?:'|’)?t (?:run|start|build|compile|load)|(?:crash(?:es)?|fails?|errors?|throws?|freezes?) (?:on|when|with|at|after|every|always|again|\w+)|has (?:a |an |some |many )?(?:bugs?|errors?|problems?|issues?)|(?:gives?|shows?|throws?|returns?) (?:me )?(?:an? )?(?:error|blank|white screen|404|500))\b/i;
const CONFIRM = /^(?:do it|do that|do this|go|go ahead|proceed|start|begin|yes|yes please|yes do it|yes go ahead|yes fix it|please do|please do it|do all of (?:that|it|them)|sounds good|that works|let(?:'|’)?s do it|go for it)$/i;
/** "Apply the fixes", "implement your suggestions": names the work itself, so it needs only something to work on. */
const APPLY = /^(?:apply|implement|make|do) (?:all )?(?:of )?(?:the|those|these|your|my|that|all the)?\s*(?:fix|fixes|changes?|suggestions?|recommendations?|corrections?|improvements?|updates?)(?: you (?:suggested|listed|mentioned|proposed))?$/i;

const sentences = (p: string) => p.split(/(?<=[.!?])\s+|\n+|;\s*|,\s*(?:then|and then|also|and also)\s+/i).map((s) => s.trim()).filter(Boolean).slice(0, 5);
const clean = (s: string) => { let t = s.trim().replace(POLITE, ''); for (let i = 0; i < 3 && TAIL.test(t); i++) t = t.replace(TAIL, ''); return t.replace(/[\s.!?,:;]+$/, '').trim(); };

/** What kind of code work a message asks for, or null when it is something else. `ctx` says what there is to work on. */
export function detectCodeWork(prompt: string, ctx: CodeCtx = {}): CodeWork | null {
  const full = prompt.trim(); if (!full) return null;
  const hasCode = !!ctx.hasFiles || !!ctx.afterCode || CODE_TOKENS.test(full) || ERROR_TOKENS.test(full);
  // A bare "yes" / "do it" / "go ahead" is a request only when the last reply offered to make the changes.
  const whole = full.toLowerCase().replace(/[\s.!?,]+$/, '').replace(/^(?:ok|okay|alright|sure|well)[\s,]+/, '');
  if (CONFIRM.test(whole)) return ctx.offered && hasCode ? { task: 'fix', via: 'confirm' } : null;
  for (const raw of sentences(full)) {
    const core = clean(raw); if (!core) continue;
    const low = core.toLowerCase();
    // a question or a request to explain is not a request to do the work
    if (/^(?:how|what|whats|what(?:'|’)?s|why|who|when|where|which|is|are|do|does|did|should|explain|describe|tell me|show me how|teach|walk me|can i|could i|may i|will it|would it)\b/i.test(low)) continue;
    if (APPLY.test(low)) { if (hasCode) return { task: 'fix', via: 'confirm' }; continue; }
    if (NON_CODE.test(low) && !/\b(?:code|app|project|bug|api|function|component|script)\b/i.test(low)) continue;
    if (MEDIA_WORD.test(low) && !CODE_STRONG.test(low)) continue;

    const rest = (re: RegExp) => core.replace(re, '').replace(/^\s*(?:up|out|over|through)\b/i, '').trim();
    const pronoun = (r: string) => new RegExp(`^${PRON}\\b`, 'i').test(r) || r === '';
    // fix / debug
    if (DEBUG_V.test(core) || FIX_V.test(core)) {
      const task: CodeTask = DEBUG_V.test(core) ? 'debug' : 'fix'; const r = rest(DEBUG_V.test(core) ? DEBUG_V : FIX_V);
      if (/^(?:the |a |an |my |your |this |that )?(?:typo|typos|grammar|spelling|sentence|paragraph|essay|text)\b/i.test(r)) continue;
      if ((pronoun(r) || NAMES_CODE.test(r.split(/\s+/).slice(0, 6).join(' ')) || DEBUG_V.test(core)) && hasCode) return { task, via: 'phrase' };
      continue;
    }
    if (MAKE_WORK.test(core)) return hasCode ? { task: 'fix', via: 'phrase' } : null;
    if (MAKE_BETTER.test(core)) return hasCode ? { task: 'upgrade', via: 'phrase' } : null;
    if (DELIVER.test(core)) { if (hasCode) return { task: 'fix', via: 'phrase' }; continue; }
    if (BROKEN_SUBJECT.test(core) && BROKEN_STATE.test(core)) { if (hasCode) return { task: 'fix', via: 'phrase' }; continue; }
    // wire / connect
    if (WIRE_V.test(core)) {
      const r = rest(WIRE_V);
      if (/^(?:it|this|that|them|these|those|everything|all|up|the (?:whole|entire) \w+)\b/i.test(r) || NAMES_CODE.test(r.split(/\s+/).slice(0, 8).join(' '))) { if (hasCode) return { task: 'wire', via: 'phrase' }; }
      continue;
    }
    // build / create / finish
    if (BUILD_V.test(core)) {
      const r = rest(BUILD_V); const head = r.split(/\s+/).slice(0, 7).join(' ');
      if (/^(?:continue|keep|start|begin|carry on)\b/i.test(core)) { if (hasCode || BUILD_OBJECT.test(head) || r === '' || /^(?:building|coding|developing)\b/i.test(r)) return { task: 'build', via: 'phrase' }; continue; }
      if (pronoun(r) && /^(?:build|rebuild|develop|code|implement|finish|complete|assemble)\b/i.test(core)) { if (hasCode) return { task: 'build', via: 'phrase' }; continue; }
      if (BUILD_OBJECT.test(head) && !MEDIA_AFTER.test(head) && !NON_CODE.test(head)) return { task: 'build', via: 'phrase' };
      if (/^(?:implement|finish|complete|code|write)\b/i.test(core) && NAMES_CODE.test(head) && hasCode && !MEDIA_AFTER.test(head)) return { task: 'build', via: 'phrase' };
      continue;
    }
    // improve / refactor
    if (UPGRADE_V.test(core)) {
      const r = rest(UPGRADE_V);
      if ((pronoun(r) || NAMES_CODE.test(r.split(/\s+/).slice(0, 6).join(' '))) && hasCode && !NON_CODE.test(r)) return { task: 'upgrade', via: 'phrase' };
      continue;
    }
  }
  return null;
}
