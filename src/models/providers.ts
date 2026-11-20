import type { ProviderId } from '../vault/vault';
import { call, failure, type ProviderErr } from './http';
export { call, failure };
export type { ProviderErr };
export { PROVIDERS } from './providerInfo';
export interface TestResult { status: 'ok' | 'invalid' | 'error'; message: string; }

/** Text-model provider key check only. Media APIs are intentionally not included. */
export async function testKey(provider: ProviderId, secret: string): Promise<TestResult> {
  const urls: Record<ProviderId, string> = { openai: 'https://api.openai.com/v1/models', gemini: 'https://generativelanguage.googleapis.com/v1beta/models', xai: 'https://api.x.ai/v1/models' };
  const headers: Record<ProviderId, Record<string, string>> = { openai: { Authorization: `Bearer ${secret}` }, gemini: { 'x-goog-api-key': secret }, xai: { Authorization: `Bearer ${secret}` } };
  try {
    const r = await call(urls[provider], { headers: headers[provider] }, secret);
    if (r.ok) return { status: 'ok', message: 'Connected. The key is valid.' };
    if ([400, 401, 403].includes(r.status)) return { status: 'invalid', message: 'The provider rejected this key.' };
    return { status: 'error', message: (await failure(r, secret)).message };
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Test failed.' }; }
}
