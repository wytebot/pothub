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
}
// Seed list. The app asks each connected provider which of these still exist (and finds newer ones) before every run,
// so a retired model never gets picked. Add an adapter here only when its request shape is implemented in providers.ts.
export const IMAGE_MODELS: ImageModel[] = [
  { id: 'gpt-image-1', provider: 'openai', name: 'OpenAI GPT Image 1', tasks: ['text-to-image'], aspects: ['1:1', '3:2', '2:3'], maxBatch: 4, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 1, quality: 3 },
  { id: 'gemini-2.5-flash-image', provider: 'gemini', name: 'Google Gemini 2.5 Flash Image', tasks: ['text-to-image'], aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 3, quality: 2 },
  { id: 'gemini-3.1-flash-image-preview', provider: 'gemini', name: 'Google Gemini 3.1 Flash Image (preview)', tasks: ['text-to-image'], aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 3, quality: 2 },
  { id: 'gemini-3-pro-image-preview', provider: 'gemini', name: 'Google Gemini 3 Pro Image (preview)', tasks: ['text-to-image'], aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxBatch: 1, outputFormats: ['png'], negativePrompt: false, seed: false, speed: 1, quality: 3 },
];
export const ratio = (a: string) => { const [w, h] = a.split(':').map(Number); return w / h; };
export const ALL_ASPECTS = [...new Set(IMAGE_MODELS.flatMap((m) => m.aspects))].sort((a, b) => ratio(a) - ratio(b));

export interface VideoModel { id: string; provider: ProviderId; name: string; tasks: 'text-to-video'[]; aspects: string[]; durations: number[]; speed: 1 | 2 | 3; quality: 1 | 2 | 3; discovered?: boolean; }
export const VIDEO_MODELS: VideoModel[] = [
  { id: 'veo-3.1-generate-preview', provider: 'gemini', name: 'Google Veo 3.1 (preview)', tasks: ['text-to-video'], aspects: ['16:9', '9:16'], durations: [8], speed: 1, quality: 3 },
  { id: 'veo-3.1-fast-generate-preview', provider: 'gemini', name: 'Google Veo 3.1 Fast (preview)', tasks: ['text-to-video'], aspects: ['16:9', '9:16'], durations: [8], speed: 3, quality: 2 },
  { id: 'veo-3.1-lite-generate-preview', provider: 'gemini', name: 'Google Veo 3.1 Lite (preview)', tasks: ['text-to-video'], aspects: ['16:9', '9:16'], durations: [8], speed: 3, quality: 1 },
  { id: 'veo-3.0-generate-001', provider: 'gemini', name: 'Google Veo 3', tasks: ['text-to-video'], aspects: ['16:9'], durations: [8], speed: 1, quality: 3 },
  { id: 'veo-3.0-fast-generate-001', provider: 'gemini', name: 'Google Veo 3 Fast', tasks: ['text-to-video'], aspects: ['16:9'], durations: [8], speed: 3, quality: 2 },
];
