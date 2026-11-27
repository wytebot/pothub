import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { preflightZip } from './sandboxValidation';

describe('sandbox ZIP preflight', () => {
  it('accepts a normal small ZIP and lists its paths', () => {
    const zip = zipSync({ 'package.json': strToU8('{}'), 'src/app.ts': strToU8('export const ok = true;') });
    expect(preflightZip(zip)).toEqual(['package.json', 'src/app.ts']);
  });
  it('rejects traversal paths', () => {
    const zip = zipSync({ '../outside.txt': strToU8('unsafe') });
    expect(() => preflightZip(zip)).toThrow(/unsafe file path/i);
  });
  it('rejects excessive file counts before extraction', () => {
    const files: Record<string, Uint8Array> = {}; for (let i = 0; i < 1501; i++) files[`file-${i}.txt`] = strToU8('a');
    const zip = zipSync(files);
    expect(() => preflightZip(zip)).toThrow(/too many files/i);
  });
});
