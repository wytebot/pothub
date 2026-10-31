/** Shared, declarative provider catalogue. Protocol adapters are selected by `protocol`;
 * capabilities are conservative and describe supported integrations, not marketing claims. */
const TEXT = ['text','json-mode'];
const VISION = [...TEXT,'vision'];
const OPENAI = (id,label,baseUrl,models,extra={})=>({id,label,protocol:'openai-compatible',auth:'bearer',baseUrl,models,capabilities:VISION,streaming:true,implemented:true,...extra});
const ANTHROPIC = (id,label,baseUrl,models,extra={})=>({id,label,protocol:'anthropic-compatible',auth:'x-api-key',baseUrl,models,capabilities:VISION,streaming:true,implemented:true,...extra});
// Keep defaults in one place and prefer the documented stable Gemini 2.5 model family.
export const DEFAULT_MODELS = { text: 'gemini-2.5-flash' };
export const PROVIDERS = [
 {id:'gemini',label:'Google Gemini',protocol:'gemini',auth:'x-goog-api-key',baseUrl:'https://generativelanguage.googleapis.com',models:['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash'],modelsByFunction:{Image:['gemini-2.0-flash-preview-image-generation']},capabilities:[...VISION,'image','video','embeddings'],streaming:true,implemented:true},
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
 OPENAI('azure-openai','Azure OpenAI','',[],{auth:'api-key',requiresCustomEndpoint:true,implemented:false}),
 OPENAI('huggingface','Hugging Face Inference','https://router.huggingface.co/v1',['meta-llama/Llama-3.3-70B-Instruct']),
 OPENAI('openai-compatible','OpenAI-compatible custom endpoint','',[],{requiresCustomEndpoint:true,implemented:false}),
 ANTHROPIC('anthropic-compatible','Anthropic-compatible custom endpoint','',[],{requiresCustomEndpoint:true,implemented:false}),
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
export function normalizeProvider(value){const s=String(value||'').trim().toLowerCase().replace(/[_ ]+/g,'-');if(['gemini','google-gemini','google'].includes(s))return 'gemini';if(['openai-compatible','openai-compatible-custom-endpoint'].includes(s))return 'openai-compatible';if(['anthropic-compatible','anthropic-compatible-custom-endpoint'].includes(s))return 'anthropic-compatible';const exact=providerById(s);if(exact)return exact.id;const byLabel=PROVIDERS.find(p=>p.label.toLowerCase()===s);return byLabel?.id||null}
