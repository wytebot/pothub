// Minimal typing for blakejs so the build never depends on the package shipping its own declarations.
declare module 'blakejs' {
  export function blake2b(input: Uint8Array | string, key?: Uint8Array | null, outlen?: number): Uint8Array;
}
