import type { ProviderId } from '../vault/vault';
/** The only provider function exposed by the text-only Pothub build. */
export type Fn = 'text';
export const FNS: Fn[] = ['text'];
export const FN_LABEL: Record<Fn, string> = { text: 'Text, coding & documents' };
export interface CredField { id: string; label: string; minLength: number; }
export const isProviderId = (p: string): p is ProviderId => Object.prototype.hasOwnProperty.call(PROVIDERS, p);
export interface ProviderInfo { name: string; billing: string; keyFrom: string; text: boolean; lists: boolean; beta?: boolean; keyHint?: string; fields?: CredField[]; }
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { name: 'OpenAI', billing: 'API usage is billed directly by OpenAI. Pothub is free.', keyFrom: 'platform.openai.com', text: true, lists: true },
  gemini: { name: 'Google Gemini', billing: 'API usage is billed directly by Google. Pothub is free.', keyFrom: 'aistudio.google.com', text: true, lists: true },
  xai: { name: 'xAI (Grok)', billing: 'API usage is billed directly by xAI. Pothub is free.', keyFrom: 'console.x.ai', text: true, lists: true, beta: true },
  anthropic: { name: 'Anthropic (Claude)', billing: 'API usage is billed directly by Anthropic. Pothub is free.', keyFrom: 'console.anthropic.com', text: true, lists: true },
  deepseek: { name: 'DeepSeek', billing: 'API usage is billed directly by DeepSeek. Pothub is free.', keyFrom: 'platform.deepseek.com', text: true, lists: true },
  mistral: { name: 'Mistral AI', billing: 'API usage is billed directly by Mistral. Pothub is free.', keyFrom: 'console.mistral.ai', text: true, lists: true },
  groq: { name: 'Groq', billing: 'API usage is billed directly by Groq (free tier available). Pothub is free.', keyFrom: 'console.groq.com', text: true, lists: true },
  openrouter: { name: 'OpenRouter', billing: 'One key for hundreds of models. Billed directly by OpenRouter. Pothub is free.', keyFrom: 'openrouter.ai/keys', text: true, lists: true },
  together: { name: 'Together AI', billing: 'API usage is billed directly by Together AI. Pothub is free.', keyFrom: 'api.together.ai', text: true, lists: true },
};

/** How each provider is called. Every one except Gemini and Anthropic speaks the OpenAI chat-completions format. */
export interface Endpoint { api: 'openai' | 'gemini' | 'anthropic'; chat: string; models: string; /** name of the token-limit field */ tokens?: 'max_completion_tokens' | 'max_tokens'; }
export const ENDPOINTS: Record<ProviderId, Endpoint> = {
  openai: { api: 'openai', chat: 'https://api.openai.com/v1/chat/completions', models: 'https://api.openai.com/v1/models', tokens: 'max_completion_tokens' },
  gemini: { api: 'gemini', chat: 'https://generativelanguage.googleapis.com/v1beta', models: 'https://generativelanguage.googleapis.com/v1beta/models' },
  xai: { api: 'openai', chat: 'https://api.x.ai/v1/chat/completions', models: 'https://api.x.ai/v1/models', tokens: 'max_tokens' },
  anthropic: { api: 'anthropic', chat: 'https://api.anthropic.com/v1/messages', models: 'https://api.anthropic.com/v1/models' },
  deepseek: { api: 'openai', chat: 'https://api.deepseek.com/chat/completions', models: 'https://api.deepseek.com/models', tokens: 'max_tokens' },
  mistral: { api: 'openai', chat: 'https://api.mistral.ai/v1/chat/completions', models: 'https://api.mistral.ai/v1/models', tokens: 'max_tokens' },
  groq: { api: 'openai', chat: 'https://api.groq.com/openai/v1/chat/completions', models: 'https://api.groq.com/openai/v1/models', tokens: 'max_completion_tokens' },
  openrouter: { api: 'openai', chat: 'https://openrouter.ai/api/v1/chat/completions', models: 'https://openrouter.ai/api/v1/models', tokens: 'max_tokens' },
  together: { api: 'openai', chat: 'https://api.together.xyz/v1/chat/completions', models: 'https://api.together.xyz/v1/models', tokens: 'max_tokens' },
};
/** Request headers that carry the key (and anything else the provider requires). */
export function authHeaders(p: ProviderId, secret: string): Record<string, string> {
  if (p === 'gemini') return { 'x-goog-api-key': secret };
  if (p === 'anthropic') return { 'x-api-key': secret, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  return { Authorization: `Bearer ${secret}` };
}
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
const SINGLE: CredField[] = [{ id: 'key', label: 'API key', minLength: 16 }];
export const fieldsOf = (_p: ProviderId): CredField[] => SINGLE;
export const fnsOf = (_p: ProviderId): Fn[] => ['text'];
export const joinSecret = (_p: ProviderId, parts: string[]): string => (parts[0] ?? '').trim();
export const splitSecret = (_p: ProviderId, secret: string): string[] => [secret.trim()];
export function checkSecret(_p: ProviderId, parts: string[]): void { if ((parts[0] ?? '').trim().length < SINGLE[0].minLength) throw new Error('That key looks too short. Paste the full key from your provider.'); }
