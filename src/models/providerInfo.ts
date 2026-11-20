import type { ProviderId } from '../vault/vault';
/** The only provider function exposed by the text-only Pothub build. */
export type Fn = 'text';
export const FNS: Fn[] = ['text'];
export const FN_LABEL: Record<Fn, string> = { text: 'Text, coding & documents' };
export interface CredField { id: string; label: string; minLength: number; }
export interface ProviderInfo { name: string; billing: string; keyFrom: string; text: boolean; lists: boolean; beta?: boolean; keyHint?: string; fields?: CredField[]; }
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { name: 'OpenAI', billing: 'API usage is billed directly by OpenAI. Pothub is free.', keyFrom: 'platform.openai.com', text: true, lists: true },
  gemini: { name: 'Google Gemini', billing: 'API usage is billed directly by Google. Pothub is free.', keyFrom: 'aistudio.google.com', text: true, lists: true },
  xai: { name: 'xAI (Grok)', billing: 'API usage is billed directly by xAI. Pothub is free.', keyFrom: 'console.x.ai', text: true, lists: true, beta: true },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
const SINGLE: CredField[] = [{ id: 'key', label: 'API key', minLength: 16 }];
export const fieldsOf = (_p: ProviderId): CredField[] => SINGLE;
export const fnsOf = (_p: ProviderId): Fn[] => ['text'];
export const joinSecret = (_p: ProviderId, parts: string[]): string => (parts[0] ?? '').trim();
export const splitSecret = (_p: ProviderId, secret: string): string[] => [secret.trim()];
export function checkSecret(_p: ProviderId, parts: string[]): void { if ((parts[0] ?? '').trim().length < SINGLE[0].minLength) throw new Error('That key looks too short. Paste the full key from your provider.'); }
