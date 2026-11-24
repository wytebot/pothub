import type { ProviderId } from '../vault/vault';
import { call, failure, type ProviderErr } from './http';
export { call, failure };
export type { ProviderErr };
export { PROVIDERS } from './providerInfo';
import { ENDPOINTS, authHeaders } from './providerInfo';
export interface TestResult { status: 'ok' | 'invalid' | 'error'; message: string; }

/** Text-model provider key check only. Media APIs are intentionally not included. */
export async function testKey(provider: ProviderId, secret: string): Promise<TestResult> {
  try {
    const r = await call(ENDPOINTS[provider].models, { headers: authHeaders(provider, secret) }, secret);
    if (r.ok) return { status: 'ok', message: 'Connected. The key is valid.' };
    if ([400, 401, 403].includes(r.status)) return { status: 'invalid', message: 'The provider rejected this key.' };
    return { status: 'error', message: (await failure(r, secret)).message };
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Test failed.' }; }
}
