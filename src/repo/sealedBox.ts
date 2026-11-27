// Encrypts a GitHub Actions secret the way GitHub requires: a libsodium "sealed box" (crypto_box_seal)
// addressed to the repository's public key. Written with two small pure-JavaScript packages instead of
// libsodium, whose ES-module build cannot be bundled by Vite/Rollup (it imports a file the package lacks).
//
// crypto_box_seal = ephemeral X25519 key pair; nonce = BLAKE2b-24(ephemeralPublic || recipientPublic);
// output = ephemeralPublic || crypto_box(message, nonce, recipientPublic, ephemeralSecret).
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

/** Seals `value` for the base64 public key GitHub returned; the result is the base64 `encrypted_value` GitHub expects. */
export function sealSecret(value: string, publicKeyBase64: string): string {
  let recipient: Uint8Array;
  try { recipient = fromBase64(publicKeyBase64); } catch { throw new Error('GitHub returned an unreadable repository public key. Try again.'); }
  if (recipient.length !== nacl.box.publicKeyLength) throw new Error('GitHub returned a repository public key of the wrong size. Try again.');
  const ephemeral = nacl.box.keyPair();
  const nonceInput = new Uint8Array(ephemeral.publicKey.length + recipient.length);
  nonceInput.set(ephemeral.publicKey, 0); nonceInput.set(recipient, ephemeral.publicKey.length);
  const nonce = blake2b(nonceInput, undefined, nacl.box.nonceLength);
  const box = nacl.box(new TextEncoder().encode(value), nonce, recipient, ephemeral.secretKey);
  const sealed = new Uint8Array(ephemeral.publicKey.length + box.length);
  sealed.set(ephemeral.publicKey, 0); sealed.set(box, ephemeral.publicKey.length);
  return toBase64(sealed);
}
