import { INTENT_LEXICON, IMAGE_EDIT_LEXICON, FILE_REQUEST_LEXICON, OUTPUT_FORMATS } from './intent-lexicon.js';

export function requestedReplyLanguage(value) {
  const text=String(value||'').normalize('NFKC').toLocaleLowerCase();
  const choices=[
    ['en',/\b(?:in|reply in|answer in|write in) english\b|\ben inglés\b|\bem inglês\b|\ben anglais\b|\bauf englisch\b/],['es',/\b(?:in|reply in|answer in|write in) (?:spanish|español|espanol)\b|\ben español\b|\ben espagnol\b|\bin spanisch\b/],
    ['fr',/\b(?:in|reply in|answer in|write in) french\b|\ben français\b/],['pt',/\b(?:in|reply in|answer in|write in) portuguese\b|\bem português\b/],
    ['de',/\b(?:in|reply in|answer in|write in) german\b|\bauf deutsch\b/],['ar',/\b(?:in|reply in|answer in|write in) arabic\b|\barabic\b/],
    ['hi',/\b(?:in|reply in|answer in|write in) hindi\b/],['sw',/\b(?:in|reply in|answer in|write in) swahili\b/],
    ['yo',/\b(?:in|reply in|answer in|write in) yoruba\b/],['ig',/\b(?:in|reply in|answer in|write in) igbo\b/],['ha',/\b(?:in|reply in|answer in|write in) hausa\b/],
    ['pcm',/\b(?:in|reply in|answer in|write in) (?:nigerian pidgin|pidgin)\b/],['id',/\b(?:in|reply in|answer in|write in) indonesian\b/],
    ['zh',/\b(?:in|reply in|answer in|write in) chinese\b|\b用中文\b/],['ja',/\b(?:in|reply in|answer in|write in) japanese\b|\b日本語で\b/],
    ['ko',/\b(?:in|reply in|answer in|write in) korean\b|\b한국어로\b/],['ru',/\b(?:in|reply in|answer in|write in) russian\b/],['tr',/\b(?:in|reply in|answer in|write in) turkish\b/]
  ];
  return choices.find(([,rx])=>rx.test(text))?.[0]||'';
}

export function detectPromptLanguage(value) {
  const text=String(value||'').normalize('NFKC').replace(/[\u200E\u200F\u061C]/g,'').toLocaleLowerCase();
  if(!text.trim())return '';
  const scores=[];
  for(const [language,lex] of Object.entries(INTENT_LEXICON)){
    const terms=[...(lex.questions||[]),...(lex.polite||[]),...(lex.verbs||[]),...(lex.code||[])];
    let score=0;for(const term of terms){const t=String(term).toLocaleLowerCase();if(t&&text.includes(t))score+=Math.min(2,Math.max(1,t.length>3?2:1));}
    if(score)scores.push({language,score});
  }
  scores.sort((a,b)=>b.score-a.score);
  if(!scores.length)return '';
  if(scores.length>1&&scores[0].score===scores[1].score){
    const scripts=[['zh',/[\u3400-\u9fff]/],['ja',/[\u3040-\u30ff]/],['ko',/[\uac00-\ud7af]/],['ar',/[\u0600-\u06ff]/],['hi',/[\u0900-\u097f]/],['ru',/[\u0400-\u04ff]/]];
    const script=scripts.find(([lang,rx])=>rx.test(text));if(script)return script[0];return '';
  }
  return scores[0].language;
}

/**
 * Prompt → task classifier used to pick which configured agent function
 * (Chat, Image, Video) should receive a request.
 *
 * Design rules
 * - Pure and dependency-free so it runs identically in the browser, the Capacitor APK and Node tests.
 * - Returns a task AND a confidence. Callers decide what to do with each level:
 *     high   → the prompt is an unambiguous creation command; route it, and if the matching
 *              agent is not configured, ask the user to add one.
 *     medium → probably a creation request ("I need a logo for my bakery"); route only when the
 *              matching agent is configured, otherwise fall through to Chat instead of blocking.
 *     low    → plain conversation.
 * - Questions about HOW to make media (code, tools, theory) and requests to analyse media
 *   that is already attached stay with Chat.
 */

const IMAGE_NOUN = '(?:image|images|picture|pictures|photo|photos|photograph|portrait|illustration|artwork|wallpaper|thumbnail|logo|icon|poster|banner|avatar|meme|sketch|drawing|painting|render|rendering|cartoon|infographic|flyer|sticker)';
const VIDEO_NOUN = '(?:video|videos|clip|clips|animation|animated|short film|reel|footage|b-roll|cinematic)';
const CREATE_VERB = '(?:generate|create|make|draw|render|produce|design|paint|sketch|illustrate|compose|craft)';
const WANT_PHRASE = '(?:show me|give me|i need|i want|i would like|i\'d like|i\'m after|get me|need|want)';
const FILLER = '(?:(?:hey|hi|hello|ok|okay|so|alright|right|now|then|and|also|pothub|assistant)[\\s,:-]+)*';
const POLITE = '(?:(?:please|pls|kindly)\\s+)?(?:(?:can|could|would|will) you(?: please)?\\s+|i want you to\\s+|i need you to\\s+|help me\\s+|go ahead and\\s+|let\'s\\s+)?(?:(?:please|pls|kindly)\\s+)?';
const ARTICLE = '(?:(?:a|an|the|some|one|two|three|four|5|1|2|3|4)\\s+)?';

/** Phrases that mean "answer / explain / write code", never "render media". */
const CHAT_GUARDS = [
  /\b(?:in|using|with|via)\s+(?:python|javascript|typescript|node|react|css|html|ffmpeg|opencv|pillow|canvas|svg|swift|kotlin|java|c\+\+|rust|go|php|ruby|matlab|unity|blender|photoshop|premiere|after effects)\b/,
  /\b(?:function|method|class|component|script|code|snippet|algorithm|library|package|sdk|api|endpoint|regex|command|cli|tool|plugin|extension|codec|format|resolution|bitrate|framerate|compression|encoding|pipeline)\b/,
  /\b(?:explain|describe|analy[sz]e|summari[sz]e|review|caption|transcribe|translate|critique|identify|classify|extract text|alt text|ocr)\b/,
  /\b(?:prompt|prompts|prompt for|write (?:me )?(?:a|an) (?:prompt|description|caption|script|story|essay|poem|article))\b/,
  /\b(?:difference between|compare|comparison|tutorial|guide to|tips for|best way to|steps to|ideas for|names for|alternatives to)\b/,
];

/** Strong evidence the user wants the app (not just text) to produce the media itself. */
const STRONG_IMAGE_TAIL = /\b(?:of|showing|depicting|featuring|with|for|that shows|where)\b/;

function normalise(value) {
  return String(value || '').normalize('NFKC')
    .replace(/[\u200E\u200F\u061C]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripLead(text) {
  return text.replace(new RegExp(`^${FILLER}`), '').trim();
}

const FILE_FORMATS = [
  ['pptx', /\bpptx\b|powerpoint|power point/],
  ['xlsx', /\bxlsx\b|excel|spreadsheet/],
  ['xml', /\bxml\b/],
  ['yaml', /\byaml\b|\byml\b/],
  ['py', /\bpython file\b|(?:^|[^a-z0-9_])\.py\b/],
  ['js', /\bjavascript file\b|(?:^|[^a-z0-9_])\.js\b/],
  ['ts', /\btypescript file\b|(?:^|[^a-z0-9_])\.ts\b/],
  ['css', /\bcss file\b|(?:^|[^a-z0-9_])\.css\b/],
  ['sql', /\bsql file\b|(?:^|[^a-z0-9_])\.sql\b/],
  ['sh', /\b(?:shell script|bash script|\.sh)\b/],
  ['pdf', /\bpdf\b/],
  ['docx', /\b(?:docx|word (?:doc|document|file))\b/],
  ['xlsx', /\b(?:xlsx|excel(?: file| sheet| spreadsheet)?|spreadsheet)\b/],
  ['csv', /\bcsv\b/],
  ['json', /\bjson(?: file)?\b/],
  ['md', /\b(?:markdown|\.md|md file)\b/],
  ['html', /\bhtml (?:file|page|document)\b|(?:^|[^a-z0-9_])\.html\b/],
  ['txt', /\b(?:txt|text file|plain text file)\b|(?:^|[^a-z0-9_])\.txt\b/],
  ['zip', /\bzip(?: file| archive| folder)?\b/],
];
const FILE_REQUEST = new RegExp(
  `^${POLITE}(?:${CREATE_VERB}|write|export|save|prepare|build|put together|give me|send me|convert|turn)\\b.{0,100}\\b(?:file|document|pdf|docx|xlsx|csv|spreadsheet|report|download(?:able)?)\\b`,
);
const DOWNLOAD_HINT = /\b(?:as|into|in|to) (?:a |an )?(?:downloadable |\.?)(?:pdf|docx|xlsx|csv|json|markdown|md|txt|html|zip)\b|\bdownloadable (?:file|pdf|document)\b/;

function detectFileFormat(text) {
  for (const [format, rx] of FILE_FORMATS) if (rx.test(text)) return format;
  return '';
}

/**
 * @param {string} value raw prompt
 * @param {{attachments?: Array<{type?: string, name?: string}>}} [context]
 * @returns {{task:'chat'|'image'|'video', confidence:'high'|'medium'|'low', reason:string, chain?:'image-to-video', fileFormat?:string}}
 */
export function classifyRequest(value, context = {}) {
  const raw = normalise(value);
  const attachments = Array.isArray(context.attachments) ? context.attachments : [];
  const hasImage = attachments.some((a) => String(a?.type || '').startsWith('image/'));
  const fileFormat = (FILE_REQUEST.test(stripLead(raw)) || DOWNLOAD_HINT.test(raw) || new RegExp(`\\b(?:${OUTPUT_FORMATS.join('|')})\\b`, 'i').test(raw) && /\b(?:file|download|export|save|as|create|make|generate|document)\b/i.test(raw)) ? detectFileFormat(raw) : '';
  const multilingualFormat = (OUTPUT_FORMATS.find(f => new RegExp(`(?:\\.${f}\\b|\\b${f}\\b)`, 'i').test(raw) && /\\b(?:file|download|export|save|as|create|make|generate|document)\\b/i.test(raw)) || Object.entries(FILE_REQUEST_LEXICON).some(([language,lex]) => lex.verbs.some(v=>raw.includes(v.toLocaleLowerCase())) && lex.nouns.some(n=>raw.includes(n.toLocaleLowerCase())) && FILE_FORMATS.some(([,rx])=>rx.test(raw)))) ? detectFileFormat(raw) : '';
  const detectedLanguage=detectPromptLanguage(raw);
  const base = (task, confidence, reason, extra = {}) => ({ task, confidence, reason, ...((fileFormat || multilingualFormat) ? { fileFormat: fileFormat || multilingualFormat } : {}), ...((extra.language||detectedLanguage)?{language:extra.language||detectedLanguage}:{}), ...extra });

  if (!raw) return base('chat', 'low', 'empty');
  const text = stripLead(raw);
  if (hasImage) {
    for (const [language, terms] of Object.entries(IMAGE_EDIT_LEXICON)) {
      if (terms.some(term => text.includes(String(term).normalize('NFKC').toLocaleLowerCase()))) return base('image', 'high', `attached image edit request (${language})`, { operation: 'edit', editCapability: 'image-to-image', language });
    }
  }
  if (hasImage && /\b(?:animate|bring (?:it|this|that|them) to life|make (?:it|this|that|them) (?:move|come alive)|turn (?:it|this|that|them) into (?:a |an )?(?:video|clip|animation)|(?:video|clip|animation) (?:from|of) (?:this|the attached|my) (?:image|photo|picture))\b/.test(text)) return base('video', 'high', 'attached image + motion request', { chain: 'image-to-video' });
  // Preserve the established English how-to/code/analysis boundary before multilingual matching.
  if (/^(?:how|what|why|when|where|which|who|is|are|does|do|did|should i|can i)\b/i.test(text) || CHAT_GUARDS.some(rx => rx.test(text))) return base('chat', 'low', 'guarded: how-to, code or analysis request');
  // Data-driven multilingual detection. CJK scripts are matched by substrings rather than word boundaries.
  for (const [language, lex] of Object.entries(INTENT_LEXICON)) {
    const has = (items) => items.some(term => term && text.includes(term.toLocaleLowerCase(language === 'tr' ? 'tr' : undefined)));
    const question = has(lex.questions);
    const guarded = has(lex.code) || question;
    const image = has(lex.image), video = has(lex.video), verb = has(lex.verbs);
    if (guarded && !(verb && (image || video) && !has(lex.questions) && !has(lex.code))) return base('chat', 'low', `guarded multilingual how-to, code or analysis request (${language})`, { language });
    if (verb && video) return base('video', 'high', `explicit video creation command (${language})`, { language });
    if (verb && image) return base('image', 'high', `explicit image creation command (${language})`, { language });
    if ((has(lex.polite)) && (image || video)) return base(video ? 'video' : 'image', 'medium', `ambiguous media request (${language})`, { language });
  }


  // 1. Attached image + motion words → image-to-video chain (existing chat → prompt → video flow).
  if (hasImage && /\b(?:animate|bring (?:it|this|that|them) to life|make (?:it|this|that|them) (?:move|come alive)|turn (?:it|this|that|them) into (?:a |an )?(?:video|clip|animation)|(?:video|clip|animation) (?:from|of) (?:this|the attached|my) (?:image|photo|picture))\b/.test(text)) {
    return base('video', 'high', 'attached image + motion request', { chain: 'image-to-video' });
  }

  // 2. Guards: how-to questions, code, analysis of existing media, prompt writing.
  const isGuarded = CHAT_GUARDS.some((rx) => rx.test(text));
  // A question mark alone does not block ("Can you draw a cat?"), but wh-/how-questions do.
  const startsAsQuestion = /^(?:how|what|why|when|where|which|who|is|are|does|do|did|should i|can i)\b/.test(text);
  if (startsAsQuestion) return base('chat', 'low', 'question');

  const imageDirect = new RegExp(`^${POLITE}${CREATE_VERB}\\b.{0,80}?\\b${IMAGE_NOUN}\\b`);
  const videoDirect = new RegExp(`^${POLITE}${CREATE_VERB}\\b.{0,80}?\\b${VIDEO_NOUN}\\b`);
  const imageWant = new RegExp(`^${POLITE}${WANT_PHRASE}\\s+${ARTICLE}(?:[a-z-]+\\s+){0,3}${IMAGE_NOUN}\\b`);
  const videoWant = new RegExp(`^${POLITE}${WANT_PHRASE}\\s+${ARTICLE}(?:[a-z-]+\\s+){0,3}${VIDEO_NOUN}\\b`);
  const nounFirstImage = new RegExp(`^${ARTICLE}${IMAGE_NOUN}\\s+(?:of|showing|depicting)\\b`);
  const nounFirstVideo = new RegExp(`^${ARTICLE}${VIDEO_NOUN}\\s+(?:of|showing|depicting)\\b`);

  const wantsVideo = videoDirect.test(text) || nounFirstVideo.test(text);
  const wantsVideoSoft = videoWant.test(text);
  const wantsImage = imageDirect.test(text) || nounFirstImage.test(text);
  const wantsImageSoft = imageWant.test(text);

  // Code / tooling guards demote everything except an unmistakable command with a "<noun> of/showing" tail.
  if (isGuarded) {
    const tail = STRONG_IMAGE_TAIL.test(text);
    if ((wantsVideo || wantsVideoSoft) && !/\b(?:function|code|script|api|codec|ffmpeg|library|command)\b/.test(text) && tail && !/\b(?:explain|describe|analy[sz]e|summari[sz]e|prompt|caption)\b/.test(text)) {
      // fall through to the normal decision below
    } else if ((wantsImage || wantsImageSoft) && !/\b(?:function|code|script|api|library|command|component|class|method|regex|prompt|caption|explain|describe|analy[sz]e|summari[sz]e|alt text|ocr)\b/.test(text) && tail) {
      // fall through
    } else {
      return base('chat', 'low', 'guarded: how-to, code or analysis request');
    }
  }

  if (wantsVideo) return base('video', 'high', 'explicit video creation command');
  if (wantsImage) return base('image', 'high', 'explicit image creation command');
  if (wantsVideoSoft) return base('video', 'medium', 'wants a video');
  if (wantsImageSoft) return base('image', 'medium', 'wants an image');

  // Bare art verbs ("draw a cat", "paint a sunset over the sea") imply an image, except for
  // diagram-style objects that a text agent answers better ("draw a conclusion", "draw a flowchart").
  if (new RegExp(`^${POLITE}(?:draw|paint|sketch|illustrate)\\s+(?:me\\s+)?${ARTICLE}\\S`).test(text)
    && !/^\S*\s*(?:please\s+)?(?:draw|paint|sketch|illustrate)\b.{0,20}\b(?:conclusion|conclusions|diagram|chart|graph|table|flowchart|schema|plot|parallel|comparison|inference|attention|line|lines|boundary|boundaries|blank)\b/.test(text)) {
    return base('image', 'medium', 'art verb');
  }

  // "<noun> for <subject>" shorthand: "logo for my bakery", "poster for a jazz night".
  if (new RegExp(`^${ARTICLE}(?:[a-z-]+\\s+){0,2}(?:logo|poster|banner|thumbnail|wallpaper|avatar|icon|flyer|sticker)\\s+(?:for|of|about)\\b`).test(text)) {
    return base('image', 'medium', 'design asset shorthand');
  }
  return base('chat', 'low', 'conversation');
}

/** Backwards-compatible wrapper: the routed task only. Medium/high confidence both route. */
export function inferRequestedTask(value, context) {
  const { task } = classifyRequest(value, context);
  return task;
}
