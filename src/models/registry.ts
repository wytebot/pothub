import type { ProviderId } from '../vault/vault';

/** Only list what an adapter in this app actually implements. Edit this file as providers change. */
export interface ImageModel {
  id: string; provider: ProviderId; name: string;
  tasks: 'text-to-image'[];
  aspects: string[]; maxBatch: number; outputFormats: string[];
  negativePrompt: boolean; seed: boolean;
  speed: 1 | 2 | 3; quality: 1 | 2 | 3; // rough editorial rankings used only for "Auto" ordering
  /** true when found from the provider's live model list rather than this file */
  discovered?: boolean;
  /** adapter-specific settings (endpoint names, size keys) */
  params?: Record<string, string | number>;
  /** true when the provider's model list is not expected to include this model */
  unlisted?: boolean;
}
const im = (id: string, provider: ProviderId, name: string, aspects: string[], maxBatch: number, speed: 1 | 2 | 3, quality: 1 | 2 | 3, params?: Record<string, string | number>): ImageModel =>
  ({ id, provider, name, tasks: ['text-to-image'], aspects, maxBatch, outputFormats: ['png'], negativePrompt: false, seed: false, speed, quality, params });
const vm = (id: string, provider: ProviderId, name: string, aspects: string[], durations: number[], speed: 1 | 2 | 3, quality: 1 | 2 | 3, params?: Record<string, string | number>, unlisted = false): VideoModel =>
  ({ id, provider, name, tasks: ['text-to-video'], aspects, durations, speed, quality, params, ...(unlisted ? { unlisted: true } : {}) });
// Seed list. The app asks each connected provider which of these still exist (and finds newer ones) before every run,
// so a retired model never gets picked. Add an adapter here only when its request shape is implemented in providers.ts.
export const IMAGE_MODELS: ImageModel[] = [
  { id: 'gpt-image-1', provider: 'openai', name: 'OpenAI GPT Image 1', tasks: ['text-to-image'], aspects: ['1:1', '3:2', '2:3'], maxBatch: 4, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 1, quality: 3 },
  { id: 'gemini-2.5-flash-image', provider: 'gemini', name: 'Google Gemini 2.5 Flash Image', tasks: ['text-to-image'], aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 3, quality: 2 },
  { id: 'gemini-3.1-flash-image-preview', provider: 'gemini', name: 'Google Gemini 3.1 Flash Image (preview)', tasks: ['text-to-image'], aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 3, quality: 2 },
  { id: 'gemini-3-pro-image-preview', provider: 'gemini', name: 'Google Gemini 3 Pro Image (preview)', tasks: ['text-to-image'], aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 1, quality: 3 },
  // ---- Added providers. Each one is called through the adapter named in models/adapters.ts. ----
  im('grok-2-image', 'xai', 'xAI Grok 2 Image', ['1:1'], 4, 2, 3),
  im('ultra', 'stability', 'Stability AI Stable Image Ultra', ['1:1', '16:9', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'], 1, 1, 3, { path: 'ultra' }),
  im('core', 'stability', 'Stability AI Stable Image Core', ['1:1', '16:9', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'], 1, 3, 2, { path: 'core' }),
  im('sd3.5-large', 'stability', 'Stability AI Stable Diffusion 3.5 Large', ['1:1', '16:9', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'], 1, 2, 2, { path: 'sd3', model: 'sd3.5-large' }),
  im('flux-pro-1.1', 'bfl', 'FLUX 1.1 Pro', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 1, 2, 3),
  im('flux-pro-1.1-ultra', 'bfl', 'FLUX 1.1 Pro Ultra', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', '9:21'], 1, 1, 3, { ar: 1 }),
  im('flux-dev', 'bfl', 'FLUX Dev', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 1, 2, 2),
  im('ideogram-v3-quality', 'ideogram', 'Ideogram 3.0', ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '16:10', '10:16', '3:1', '1:3'], 4, 1, 3, { speed: 'QUALITY' }),
  im('ideogram-v3-turbo', 'ideogram', 'Ideogram 3.0 Turbo', ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '16:10', '10:16', '3:1', '1:3'], 4, 3, 2, { speed: 'TURBO' }),
  im('recraftv3', 'recraft', 'Recraft V3', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3),
  im('black-forest-labs/FLUX.1.1-pro', 'together', 'Together FLUX 1.1 Pro', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3),
  im('black-forest-labs/FLUX.1-schnell', 'together', 'Together FLUX Schnell', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 3, 1, { steps: 4 }),
  im('de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3', 'leonardo', 'Leonardo Phoenix', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3),
  im('7b592283-e8a7-4c5a-9ba6-d18c31f258b9', 'leonardo', 'Leonardo Lucid Origin', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3),
  im('photon-1', 'luma', 'Luma Photon', ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'], 1, 2, 3),
  im('photon-flash-1', 'luma', 'Luma Photon Flash', ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'], 1, 3, 2),
  im('image-01', 'minimax', 'MiniMax Image 01', ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'], 4, 2, 2),
  im('cogview-4-250304', 'zhipu', 'Zhipu CogView 4', ['1:1', '9:16', '16:9', '3:4', '4:3', '2:1', '1:2'], 1, 2, 2),
  im('seedream-4-5-251128', 'byteplus', 'BytePlus Seedream 4.5', ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'], 4, 2, 3),
  im('seedream-4-0-250828', 'byteplus', 'BytePlus Seedream 4.0', ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'], 4, 2, 3),
  im('kling-v2', 'kling', 'Kling Image V2', ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'], 4, 2, 2),
  im('hf/black-forest-labs/FLUX.1-schnell', 'huggingface', 'Hugging Face FLUX Schnell', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 1, 3, 1),
  im('hf/stabilityai/stable-diffusion-xl-base-1.0', 'huggingface', 'Hugging Face Stable Diffusion XL', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 1, 2, 1),
  im('fal-ai/flux/schnell', 'fal', 'fal FLUX Schnell', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 3, 1, { size: 'image_size' }),
  im('fal-ai/flux/dev', 'fal', 'fal FLUX Dev', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 2, { size: 'image_size' }),
  im('fal-ai/flux-pro/v1.1', 'fal', 'fal FLUX 1.1 Pro', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3, { size: 'image_size' }),
  im('fal-ai/flux-pro/v1.1-ultra', 'fal', 'fal FLUX 1.1 Pro Ultra', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', '9:21'], 1, 1, 3, { size: 'aspect_ratio' }),
  im('fal-ai/imagen4/preview', 'fal', 'fal Google Imagen 4', ['1:1', '3:4', '4:3', '9:16', '16:9'], 4, 2, 3, { size: 'aspect_ratio' }),
  im('fal-ai/ideogram/v3', 'fal', 'fal Ideogram 3.0', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3, { size: 'image_size' }),
  im('fal-ai/bytedance/seedream/v4/text-to-image', 'fal', 'fal Seedream 4', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'], 4, 2, 3, { size: 'image_size' }),
  im('black-forest-labs/flux-schnell', 'replicate', 'Replicate FLUX Schnell', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', '9:21'], 4, 3, 1),
  im('black-forest-labs/flux-1.1-pro', 'replicate', 'Replicate FLUX 1.1 Pro', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', '9:21'], 1, 2, 3),
  im('ideogram-ai/ideogram-v3-turbo', 'replicate', 'Replicate Ideogram 3.0 Turbo', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '16:10', '10:16', '3:1', '1:3'], 1, 3, 2),
  im('google/imagen-4', 'replicate', 'Replicate Google Imagen 4', ['1:1', '3:4', '4:3', '9:16', '16:9'], 1, 2, 3),
];
export const ratio = (a: string) => { const [w, h] = a.split(':').map(Number); return w / h; };
export const ALL_ASPECTS = [...new Set(IMAGE_MODELS.flatMap((m) => m.aspects))].sort((a, b) => ratio(a) - ratio(b));

export interface VideoModel { id: string; provider: ProviderId; name: string; tasks: 'text-to-video'[]; aspects: string[]; durations: number[]; speed: 1 | 2 | 3; quality: 1 | 2 | 3; discovered?: boolean; params?: Record<string, string | number>; unlisted?: boolean; }
export const VIDEO_MODELS: VideoModel[] = [
  { id: 'veo-3.1-generate-preview', provider: 'gemini', name: 'Google Veo 3.1 (preview)', tasks: ['text-to-video'], aspects: ['16:9', '9:16'], durations: [8], speed: 1, quality: 3 },
  { id: 'veo-3.1-fast-generate-preview', provider: 'gemini', name: 'Google Veo 3.1 Fast (preview)', tasks: ['text-to-video'], aspects: ['16:9', '9:16'], durations: [8], speed: 3, quality: 2 },
  { id: 'veo-3.1-lite-generate-preview', provider: 'gemini', name: 'Google Veo 3.1 Lite (preview)', tasks: ['text-to-video'], aspects: ['16:9', '9:16'], durations: [8], speed: 3, quality: 1 },
  { id: 'veo-3.0-generate-001', provider: 'gemini', name: 'Google Veo 3', tasks: ['text-to-video'], aspects: ['16:9'], durations: [8], speed: 1, quality: 3 },
  { id: 'veo-3.0-fast-generate-001', provider: 'gemini', name: 'Google Veo 3 Fast', tasks: ['text-to-video'], aspects: ['16:9'], durations: [8], speed: 3, quality: 2 },
  // ---- Added providers ----
  vm('sora-2', 'openai', 'OpenAI Sora 2', ['16:9', '9:16'], [8], 2, 3, undefined, true),
  vm('sora-2-pro', 'openai', 'OpenAI Sora 2 Pro', ['16:9', '9:16'], [8], 1, 3, undefined, true),
  vm('ray-2', 'luma', 'Luma Ray 2', ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], [5], 1, 3),
  vm('ray-flash-2', 'luma', 'Luma Ray Flash 2', ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], [5], 3, 2),
  vm('MiniMax-Hailuo-02', 'minimax', 'MiniMax Hailuo 02', ['16:9'], [6], 2, 3),
  vm('cogvideox-3', 'zhipu', 'Zhipu CogVideoX 3', ['16:9', '9:16', '1:1', '4:3', '3:4'], [5], 2, 2),
  vm('seedance-1-0-pro-250528', 'byteplus', 'BytePlus Seedance 1.0 Pro', ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], [5], 2, 3),
  vm('seedance-1-0-lite-t2v-250428', 'byteplus', 'BytePlus Seedance 1.0 Lite', ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], [5], 3, 2),
  vm('kling-v2-1-master', 'kling', 'Kling 2.1 Master', ['16:9', '9:16', '1:1'], [5], 1, 3),
  vm('kling-v2-1', 'kling', 'Kling 2.1', ['16:9', '9:16', '1:1'], [5], 2, 2),
  vm('fal-ai/veo3', 'fal', 'fal Google Veo 3', ['16:9', '9:16'], [8], 1, 3, { dur: 's8' }),
  vm('fal-ai/veo3/fast', 'fal', 'fal Google Veo 3 Fast', ['16:9', '9:16'], [8], 3, 2, { dur: 's8' }),
  vm('fal-ai/kling-video/v2.1/master/text-to-video', 'fal', 'fal Kling 2.1 Master', ['16:9', '9:16', '1:1'], [5], 1, 3, { dur: 'str' }),
  vm('fal-ai/minimax/hailuo-02/standard/text-to-video', 'fal', 'fal MiniMax Hailuo 02', ['16:9'], [6], 2, 2, { dur: 'str' }),
  vm('fal-ai/sora-2/text-to-video', 'fal', 'fal OpenAI Sora 2', ['16:9', '9:16'], [8], 2, 3, { dur: 'num' }),
  vm('fal-ai/wan/v2.2-a14b/text-to-video', 'fal', 'fal Wan 2.2', ['16:9', '9:16', '1:1'], [5], 2, 2, { dur: 'none' }),
  vm('google/veo-3', 'replicate', 'Replicate Google Veo 3', ['16:9'], [8], 1, 3),
  vm('minimax/hailuo-02', 'replicate', 'Replicate MiniMax Hailuo 02', ['16:9'], [6], 2, 3),
  vm('bytedance/seedance-1-pro', 'replicate', 'Replicate Seedance 1 Pro', ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], [5], 2, 3),
];
