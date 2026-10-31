/**
 * Sealing helpers built on @hapi/iron.
 *
 * The codebase uses the `sealData` / `unsealData` API (originally from
 * iron-session), but @hapi/iron itself only exports `seal` / `unseal`.
 * Importing `{ sealData }` from '@hapi/iron' fails at module load, which
 * made every route that imports server/lib.js return a 500.
 */
import * as IronModule from '@hapi/iron';

const Iron = IronModule.default && IronModule.default.seal ? IronModule.default : IronModule;

function passwordFrom(options) {
  const password = options?.password;
  if (typeof password !== 'string' || password.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters.');
  }
  return password;
}

export async function sealData(data, options = {}) {
  const ttl = Number(options.ttl);
  return Iron.seal(data, passwordFrom(options), { ...Iron.defaults, ...(Number.isFinite(ttl) && ttl > 0 ? { ttl } : {}) });
}

export async function unsealData(sealed, options = {}) {
  return Iron.unseal(String(sealed || ''), passwordFrom(options), Iron.defaults);
}
