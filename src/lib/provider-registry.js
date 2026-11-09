/** Shared, declarative provider catalogue. Protocol adapters are selected by `protocol`;
 * capabilities are conservative and describe supported integrations, not marketing claims. */
const TEXT = ['text','json-mode'];
const VISION = [...TEXT,'vision'];
const OPENAI = (id,label,baseUrl,models,extra={})=>({id,label,protocol:'openai-compatible',auth:'bearer',baseUrl,models,capabilities:VISION,streaming:true,implemented:true,...extra});
const ANTHROPIC = (id,label,baseUrl,models,extra={})=>({id,label,protocol:'anthropic-compatible',auth:'x-api-key',baseUrl,models,capabilities:VISION,streaming:true,implemented:true,...extra});
// Keep defaults in one place and prefer the documented stable Gemini 2.5 model family.
// No app-wide model default: each task must use an explicitly configured user agent.
export const DEFAULT_MODELS = {};
// Migrate a previously saved model ID that is no longer offered. Keep this explicit
// and narrow: never silently substitute arbitrary provider/model combinations.
export function normalizeConfiguredModel(provider, model) {
  const id = normalizeProvider(provider);
  const value = String(model || '').trim().replace(/^models\//, '');
  return id === 'gemini' && RETIRED_GEMINI_MODELS[value] ? RETIRED_GEMINI_MODELS[value] : value;
}
// Gemini models Google has shut down (a retired model answers HTTP 404) and the replacement Google recommends.
// Agents saved by older PotHub versions still carry these IDs.
const RETIRED_GEMINI_MODELS = {
  'gemini-2.5-flash-image': 'gemini-3.1-flash-image',
  'gemini-3.8-flash': 'gemini-3.6-flash',
  'gemini-2.5-flash-image-preview': 'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image',
  'gemini-2.5-flash': 'gemini-3.6-flash',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'imagen-4.0-generate-001': 'gemini-3.1-flash-image',
  'imagen-4.0-fast-generate-001': 'gemini-3.1-flash-image',
  'imagen-4.0-ultra-generate-001': 'gemini-3.1-flash-image'
};

export const PROVIDERS = [
 {id:'gemini',label:'Google Gemini',protocol:'gemini',auth:'x-goog-api-key',baseUrl:'https://generativelanguage.googleapis.com',models:['gemini-3.6-flash','gemini-3.5-flash-lite'],modelsByFunction:{Image:['gemini-3.1-flash-image','gemini-3-pro-image']},capabilities:[...VISION,'image','video','embeddings'],streaming:true,implemented:true},
 OPENAI('openai','OpenAI','https://api.openai.com/v1',['gpt-4.1','gpt-4.1-mini','gpt-4o','gpt-4o-mini'],{capabilities:[...VISION,'image','embeddings'],modelsByFunction:{Image:['gpt-image-2','gpt-image-2.5-sunburst','gpt-image-2.5-flare']}}),
 ANTHROPIC('anthropic','Anthropic','https://api.anthropic.com/v1',['claude-sonnet-4-5','claude-haiku-4-5','claude-opus-4-1']),
 OPENAI('mistral','Mistral','https://api.mistral.ai/v1',['mistral-large-latest','mistral-small-latest','codestral-latest']),
 OPENAI('groq','Groq','https://api.groq.com/openai/v1',['llama-3.3-70b-versatile','openai/gpt-oss-120b','qwen/qwen3-32b']),
 OPENAI('deepseek','DeepSeek','https://api.deepseek.com',['deepseek-chat','deepseek-reasoner']),
 OPENAI('xai','xAI','https://api.x.ai/v1',['grok-4','grok-3','grok-3-mini']),
 OPENAI('cohere','Cohere','https://api.cohere.com/compatibility/v1',['command-a-03-2025','command-r-plus']),
 OPENAI('perplexity','Perplexity','https://api.perplexity.ai',['sonar-pro','sonar','sonar-reasoning-pro']),
 OPENAI('together','Together AI','https://api.together.xyz/v1',['meta-llama/Llama-3.3-70B-Instruct-Turbo','Qwen/Qwen2.5-72B-Instruct-Turbo']),
 OPENAI('fireworks','Fireworks AI','https://api.fireworks.ai/inference/v1',['accounts/fireworks/models/llama-v3p3-70b-instruct']),
 OPENAI('openrouter','OpenRouter','https://openrouter.ai/api/v1',['openai/gpt-4.1-mini','anthropic/claude-sonnet-4','google/gemini-2.5-flash']),
 OPENAI('azure-openai','Azure OpenAI','',[],{auth:'api-key',requiresCustomEndpoint:true,capabilities:[...VISION,'image']}),
 OPENAI('huggingface','Hugging Face Inference','https://router.huggingface.co/v1',['meta-llama/Llama-3.3-70B-Instruct']),
 OPENAI('openai-compatible','OpenAI-compatible custom endpoint (any provider or model)','',[],{requiresCustomEndpoint:true,capabilities:[...VISION,'image']}),
 ANTHROPIC('anthropic-compatible','Anthropic-compatible custom endpoint (any provider or model)','',[],{requiresCustomEndpoint:true}),
 {id:'stability',label:'Stability AI',protocol:'image-api',auth:'bearer',baseUrl:'https://api.stability.ai',models:['stable-image-ultra','stable-image-core'],capabilities:['image'],implemented:true},
 {id:'replicate',label:'Replicate',protocol:'replicate',auth:'bearer',baseUrl:'https://api.replicate.com/v1',models:['black-forest-labs/flux-1.1-pro','kwaivgi/kling-v2.1','minimax/video-01'],modelsByFunction:{Image:['black-forest-labs/flux-1.1-pro'],Video:['kwaivgi/kling-v2.1','minimax/video-01']},capabilities:['image','video'],implemented:true},
 {id:'fal',label:'fal.ai',protocol:'fal',auth:'key',baseUrl:'https://queue.fal.run',models:['fal-ai/flux-pro/v1.1'],capabilities:['image'],implemented:true},
 {id:'black-forest-labs',label:'Black Forest Labs',protocol:'image-api',auth:'x-key',baseUrl:'https://api.bfl.ai',models:['flux-pro-1.1','flux-kontext-pro'],capabilities:['image'],implemented:true},
 {id:'runway',label:'Runway',protocol:'video-api',auth:'bearer',baseUrl:'https://api.dev.runwayml.com',models:['gen4.5','veo3.1','kling_4'],capabilities:['video'],implemented:true},
 {id:'luma',label:'Luma',protocol:'video-api',auth:'bearer',baseUrl:'https://api.lumalabs.ai/dream-machine/v1',models:['ray-2','ray-flash-2'],capabilities:['video'],implemented:true},
 {id:'kling',label:'Kling',protocol:'video-api',auth:'provider-specific',baseUrl:'',models:['kling-3.0'],capabilities:['video'],implemented:true}
];
export const FUNCTIONS = {Diagnosis:['text','json-mode'],Fix:['text','json-mode'],Chat:['text'],Image:['image'],Video:['video']};
export function providerById(id){return PROVIDERS.find(p=>p.id===id)||null}
export function providersForFunction(fn){const need=FUNCTIONS[fn]||FUNCTIONS.Diagnosis;return PROVIDERS.filter(p=>p.implemented!==false&&need.every(c=>p.capabilities.includes(c)))}
export function providerLabel(id){return providerById(id)?.label||id}
export function modelsForFunction(providerId,fn){const p=providerById(providerId);return p?.modelsByFunction?.[fn]||p?.models||[]}

/** Filter live provider catalog rows for the selected agent function. Provider model-list
 * endpoints do not all expose reliable capability metadata, so text is filtered by
 * advertised method where available and image/video use conservative model-ID hints.
 * The agent Test action remains the final check for key/account access. */
export function filterDiscoveredModels(providerId, fn, rows) {
 const id=normalizeProvider(providerId)||String(providerId||'');
 const task=String(fn||'Diagnosis').replace(/\s+/g,' ').trim();
 const list=Array.isArray(rows)?rows:[];
 const nameOf=m=>String(m?.name||m?.id||'').replace(/^models\//,'');
 const textExcluded=/(?:embed|embedding|moderation|whisper|transcri(?:be|ption)|text-to-speech|\btts\b|realtime|robotics)/i;
 return [...new Set(list.filter(m=>{
  const name=nameOf(m), descriptor=`${name} ${m?.displayName||''} ${m?.description||''}`;
  if(!name) return false;
  if(id==='gemini') {
   const methods=Array.isArray(m?.supportedGenerationMethods)?m.supportedGenerationMethods:[];
   // Gemini's models.list metadata does not reliably expose output-modality support.
   // Do not reject discovered IDs using name fragments; show all generateContent-capable
   // models as candidates and verify image output with a real, bounded provider request.
   if(task==='Image') return methods.includes('generateContent') && !textExcluded.test(descriptor) && !/(?:^|[-_/])(?:veo|video|tts)(?:[-_/]|$)/i.test(name);
   if(task==='Video') return /veo|video/i.test(descriptor);
   return methods.includes('generateContent') && !textExcluded.test(name) && !/(?:^|[-_/])(?:image|veo|video)(?:[-_/]|$)/i.test(name);
  }
  if(task==='Image') return /image|dall[-_ ]?e|flux|stable[-_ ]?diffusion|imagen|ideogram/i.test(descriptor);
  if(task==='Video') return /video|sora|veo|kling|runway|luma|ray[-_ ]?2/i.test(descriptor);
  return !textExcluded.test(name) && !/(?:^|[-_/])(?:image|video|sora|veo)(?:[-_/]|$)/i.test(name);
 }).map(nameOf).filter(x=>x&&x.length<=160))].slice(0,300);
}
export function normalizeProvider(value){const s=String(value||'').trim().toLowerCase().replace(/[_\s]+/g,'-');const aliases={'google-gemini':'gemini','gemini-api':'gemini','google':'gemini','open-ai':'openai','open-ai-compatible':'openai-compatible','claude':'anthropic','anthropic-api':'anthropic','xai':'xai','meta-llama':'openrouter'};const id=aliases[s]||s;return providerById(id)?.id||null}
