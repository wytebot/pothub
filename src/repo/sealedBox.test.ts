import { describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';
import { sealSecret } from './sealedBox';

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

describe('sealSecret', () => {
  it('produces a sealed box the repository key holder can open', () => {
    const repo = nacl.box.keyPair();
    const sealed = unb64(sealSecret('ghp_secret value ✓', b64(repo.publicKey)));
    const epk = sealed.slice(0, 32); const box = sealed.slice(32);
    const nonce = blake2b(new Uint8Array([...epk, ...repo.publicKey]), undefined, 24);
    const opened = nacl.box.open(box, nonce, epk, repo.secretKey);
    expect(opened && new TextDecoder().decode(opened)).toBe('ghp_secret value ✓');
  });
  it('uses a fresh ephemeral key every time', () => {
    const repo = nacl.box.keyPair();
    expect(sealSecret('x', b64(repo.publicKey))).not.toBe(sealSecret('x', b64(repo.publicKey)));
  });
  it('rejects a public key of the wrong size', () => {
    expect(() => sealSecret('x', b64(new Uint8Array(16)))).toThrow(/wrong size/);
  });
});
