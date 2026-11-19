import { IMAGE_MODELS, ratio, type ImageModel } from './registry';
import type { ProviderId } from '../vault/vault';

export type Task = 'text' | 'image' | 'video' | 'edit';
export interface Intent { task: Task; aspect?: string; /** true when the wording itself named the kind of output; false when it was inferred */ explicit: boolean; }

const MEDIA_NOUN = 'image|images|picture|pictures|photo|photos|photograph|illustration|drawing|painting|poster|logo|icon|wallpaper|portrait|artwork|art|sketch|thumbnail|banner|avatar|sticker|cartoon|render|rendering|mockup|video|videos|clip|animation|reel|footage|advert|advertisement|commercial';
const MEDIA_ASK = new RegExp(`\\b(generate|create|make|draw|render|produce|design|paint|illustrate|animate|imagine|show me)\\b[^.?!\\n]{0,48}\\b(${MEDIA_NOUN})\\b`, 'i');
/** Longer than this and the message is a brief or an instruction list, not "make me a poster of X". */
const MEDIA_MAX_WORDS = 60;
const VIDEO_WORD = /\b(video|videos|animate|animation|moving|clip|film|reel|footage|advertisement|advert|commercial)\b|\b\d+[- ]?seconds?\b/i;
const TEXT_START = /^(please\s+|kindly\s+|hey\s+|hi\s+)?(can|could|would|will)?\s*(you\s+)?(please\s+)?(help me( to)?\s+)?(i (need|want|would like) (you )?to\s+)?(write|draft|compose|explain|summari[sz]e|translate|rewrite|proofread|paraphrase|fix|debug|refactor|review|analy[sz]e|compare|list|outline|brainstorm|suggest|recommend|define|solve|calculate|convert|extract|plan|teach|tell me|give me|what|whats|what's|why|how|who|when|where|which|is|are|do|does|did|should|can|could|would|find|check|correct|improve|continue|expand|shorten|format|organi[sz]e|prepare|build|code|implement|answer|quiz|test me|research|create (a |an |the )?(report|essay|plan|outline|summary|document|spreadsheet|table|script|schedule|checklist|cv|resume|letter|email|proposal|presentation|lesson|story|poem|article|post|caption|function|class|app|website|program|sql|query))\b/i;
const DOC_WORDS = /\b(essay|report|article|email|e-mail|letter|cv|resume|proposal|summary|summarise|summarize|code|script|function|spreadsheet|csv|json|markdown|pdf|docx|word document|presentation|slides|poem|story|lyrics|blog|lesson plan|business plan|study plan|meal plan|table|outline|checklist|cover letter|speech|press release|contract|policy|essay|translation|worksheet|notes|minutes|agenda|itinerary|recipe|schema|database|api|algorithm|query|sql|regex|strategy|guide|tutorial|curriculum|syllabus|pitch|dataset|sample data|template|readme|documentation|brief|memo|newsletter|caption|slogan|tagline|jingle)\b/i;
const DEV_ASK = /\b(make|build|create|generate|code|develop|write|scaffold|set up|give me|i need|i want)\b[^.?!\n]{0,40}\b(app|apps|application|website|web ?site|web app|landing page|dashboard|game|chatbot|bot|api|backend|frontend|component|plugin|extension|script|program|software|project|repo|repository|library|package|cli|calculator|server|template|boilerplate|codebase|source code)\b/i;
const FILE_OUT_ASK = /\b(as|into|in|to)\s+(an?\s+)?(zip|\.zip|pdf|\.pdf|docx|word (doc|document|file)|xlsx|excel|spreadsheet|pptx|powerpoint|csv|json|markdown|text file)\b/i;
const EDIT_ASK = /transparent background|remove (the )?background|upscale|inpaint|outpaint|\b(edit|change|retouch|enhance|restyle|recolou?r|turn|make)\b[^.?!\n]{0,30}\b(this|my|the attached|the uploaded)\s+(photo|photograph|picture|image|pic)\b|\b(this|my|the attached|the uploaded) (photo|photograph|picture|image|pic)\b/i;

function aspectOf(t: string): string | undefined {
  const explicit = t.match(/\b(\d{1,2}):(\d{1,2})\b/); if (explicit) return explicit[0];
  if (/vertical|portrait (orientation|mode|format)|tiktok|reels?\b|instagram stor/.test(t)) return '9:16';
  if (/widescreen|landscape|youtube|banner/.test(t)) return '16:9';
  if (/\bsquare\b|instagram post/.test(t)) return '1:1';
  return undefined;
}

/**
 * Decides what a request is asking for. Wording that names the output ("make a poster", "write a report") wins.
 * Otherwise questions and instructions go to a text model, and short descriptions of a scene go to an image model.
 * `hasFiles` means something was attached with the + button: without a generate/edit wording it is a question about the file.
 */
export function interpret(text: string, o: { hasFiles?: boolean; hasImageFile?: boolean } = {}): Intent {
  const raw = text.trim().toLowerCase(); const aspect = aspectOf(raw);
  // "can you please make ...", "i want you to write ..." are politeness, not a different request.
  const t = raw.replace(/^(please|kindly|hey|hi|hello)[\s,]+/, '').replace(/^(can|could|would|will)\s+you\s+(please\s+)?/, '').replace(/^(i (need|want|would like)( you)? to|help me( to)?)\s+/, '').trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const question = /^(how|what|whats|what's|why|who|when|where|which|is|are|do|does|did|should)\b/.test(t) || /\?\s*$/.test(t);
  const writeFirst = /^(write|draft|compose|explain|summari[sz]e|translate|rewrite|proofread|paraphrase)\b/.test(t);
  // A picture/video request is stated up front and is short. Judge only the opening sentence, and only for short messages, so a long
  // brief that merely mentions "video" or "produce" further down ("...so it doesn't produce texts instead of video") stays a text job.
  const lead = t.split(/[?!\n]|\.\s/)[0] ?? t;
  const mediaOk = words <= MEDIA_MAX_WORDS && !(o.hasFiles && !o.hasImageFile); // a zip/pdf/doc attached means the work is on that file
  const mediaNoDoc = mediaOk && MEDIA_ASK.test(lead) && !DOC_WORDS.test(lead.replace(new RegExp(`\\b(${MEDIA_NOUN})\\b`, 'gi'), ''));
  const drawFirst = mediaOk && /^(draw|paint|sketch|illustrate|imagine|animate)\b/.test(t);
  // A question or a "write ..." request is for a text model even when it mentions a video or a picture ("write a script for a video").
  if (o.hasImageFile && EDIT_ASK.test(t)) return { task: 'edit', aspect, explicit: true };
  if (!question && !writeFirst && (mediaNoDoc || drawFirst)) return VIDEO_WORD.test(t) || /^animate\b/.test(t) ? { task: 'video', aspect, explicit: true } : { task: 'image', aspect, explicit: true };
  // building an app, a script or a file in some format is a text job, even when the wording is short ("make a todo app as a zip")
  if (!mediaNoDoc && !drawFirst && (DEV_ASK.test(t) || FILE_OUT_ASK.test(t))) return { task: 'text', explicit: true };
  if (!o.hasFiles && EDIT_ASK.test(t) && !question) return { task: 'edit', aspect, explicit: true };
  if (o.hasFiles) return { task: 'text', explicit: false };
  if (question || writeFirst || TEXT_START.test(t)) return { task: 'text', explicit: true };
  if (DOC_WORDS.test(t)) return { task: 'text', explicit: false };
  if (VIDEO_WORD.test(t) && words <= MEDIA_MAX_WORDS) return { task: 'video', aspect, explicit: false };
  if (words > 45) return { task: 'text', explicit: false };
  return { task: 'image', aspect, explicit: false };
}

export type Plan = { kind: 'ready'; model: ImageModel; aspect: string; notes: string[] } | { kind: 'blocked'; message: string };

export function planImage(o: { prompt: string; formatOverride?: string; prefer: 'quality' | 'speed'; modelOverride?: string; preferredModel?: string; connected: Set<ProviderId>; /** live catalog; defaults to the seed registry */ models?: ImageModel[]; /** models already tried in this run */ exclude?: Set<string>; /** task decided by the caller (e.g. from a /command) */ taskOverride?: 'image' }): Plan {
  const it = o.taskOverride ? { task: 'image' as const, aspect: interpret(o.prompt).aspect } : interpret(o.prompt);
  if (it.task === 'text') return { kind: 'blocked', message: 'This reads like a request for writing rather than a picture, so no image was made. Add /image to your message if you do want a picture.' };
  if (it.task === 'video') return { kind: 'blocked', message: 'This sounds like a video, so nothing was generated here. Open Video Studio to make it, or add /image to your prompt to get a still picture instead.' };
  if (it.task === 'edit') return { kind: 'blocked', message: 'This sounds like an edit to an existing image. Editing, enhancing and background removal are not available yet. Describe the image you want and it will be generated from scratch.' };
  const pool = (o.models ?? IMAGE_MODELS).filter((m) => o.connected.has(m.provider) && !o.exclude?.has(m.id) && (!o.modelOverride || m.id === o.modelOverride));
  if (!pool.length) return { kind: 'blocked', message: o.modelOverride ? 'The selected model needs a key ticked as default for Images. Set one in AI Providers.' : 'Add an API key in AI Providers and tick it as a default for Images to start generating.' };
  const score = (m: ImageModel) => (o.prefer === 'speed' ? m.speed * 10 + m.quality : m.quality * 10 + m.speed);
  const best = (ms: ImageModel[]) => ms.find((m) => m.id === o.preferredModel) ?? [...ms].sort((a, b) => score(b) - score(a))[0];
  const wanted = o.formatOverride ?? it.aspect;
  if (!wanted) { const m = best(pool); return { kind: 'ready', model: m, aspect: '1:1', notes: [] }; }
  const exact = pool.filter((m) => m.aspects.includes(wanted));
  if (exact.length) return { kind: 'ready', model: best(exact), aspect: wanted, notes: [] };
  const target = ratio(wanted); let pick: { m: ImageModel; a: string; d: number } | null = null;
  for (const m of pool) for (const a of m.aspects) { const d = Math.abs(Math.log(ratio(a) / target)); if (!pick || d < pick.d) pick = { m, a, d }; }
  return { kind: 'ready', model: pick!.m, aspect: pick!.a, notes: [`None of your connected models supports ${wanted}. Used ${pick!.a} with ${pick!.m.name}, the closest match.`] };
}
