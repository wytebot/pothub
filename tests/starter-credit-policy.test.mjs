import test from 'node:test';
import assert from 'node:assert/strict';
import {starterGrantEligibility} from '../server/starter-credit-policy.js';
import {serverDeviceFingerprints} from '../server/lib.js';

test('starter credits are one-time per server-issued device and capped per IP/UA per day',()=>{
  assert.equal(starterGrantEligibility({deviceClaimExists:false,ipClaimsToday:0}),true);
  assert.equal(starterGrantEligibility({deviceClaimExists:true,ipClaimsToday:0}),false);
  assert.equal(starterGrantEligibility({deviceClaimExists:false,ipClaimsToday:5}),false);
  assert.equal(starterGrantEligibility({deviceClaimExists:false,ipClaimsToday:4}),true);
});
test('device fingerprints are server-derived HMACs and change with server-issued device IDs',()=>{
  process.env.SESSION_SECRET='a'.repeat(64);delete process.env.DEVICE_FINGERPRINT_SECRET;
  const req={ip:'203.0.113.20',headers:{'user-agent':'PotHub test browser'}};
  const a=serverDeviceFingerprints(req,'server-device-id-00000000000000000000000000000000');
  const b=serverDeviceFingerprints(req,'server-device-id-11111111111111111111111111111111');
  assert.equal(typeof a.deviceHash,'string');assert.equal(a.deviceHash.length,64);assert.notEqual(a.deviceHash,b.deviceHash);assert.equal(a.ipHash,b.ipHash);
});
