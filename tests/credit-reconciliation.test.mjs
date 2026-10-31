import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStaleReservationRows} from '../server/lib.js';

test('reconciliation selects only reserved rows whose expiry is in the past',()=>{
  const cutoff=Date.now();const rows=[{id:'expired',expiresAt:new Date(cutoff-1)},{id:'live',expiresAt:new Date(cutoff+60000)},{id:'missing'},{id:'timestamp',expiresAt:{toMillis:()=>cutoff-5}}];
  assert.deepEqual(selectStaleReservationRows(rows,cutoff).map(x=>x.id),['expired','timestamp']);
});
