import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lib = fs.readFileSync(new URL('../server/lib.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');

test('credit and signed-media helpers are explicitly imported by server library', () => {
  assert.match(lib, /import\s*\{[^}]*grantCreditsOnce[^}]*\}\s*from\s*['"]\.\/credit-reservations\.js['"]/s);
  assert.match(lib, /import\s*\{[^}]*storeSignedObject[^}]*signStoredObject[^}]*\}\s*from\s*['"]\.\/signed-media\.js['"]/s);
});

test('agent model routing passes selected BYOK candidates without cloning Express request', () => {
  assert.match(app, /modelReq=req;return\{\.\.\.pricing,mode:'api-page',modelReq,candidates:selection\.candidates\}/);
  assert.match(app, /modelJson\(prompt,agentContext\.modelReq,extraParts,agentContext\.candidates\)/);
  assert.match(app, /const candidates = userCandidates\.map/);
  assert.doesNotMatch(app, /process\.env\.GEMINI_API_KEY\s*\|\|/);
});

test('video Buffer response uses module-scope Readable import', () => {
  assert.match(app, /^import \{ Readable \} from 'node:stream';/);
  assert.doesNotMatch(app, /const \{Readable\}=await import\('node:stream'\)/);
});

test('only the reservation-owning image request can release its hold', () => {
  assert.match(app, /ownsImageReservation=!reservation\.duplicate&&reservation\.state==='reserved'/);
  assert.match(app, /if\(ownsImageReservation&&reservationRef&&!imageSettlementStarted\)/);
});

test('image operation marks reservation settled immediately after commit', () => {
  assert.match(app, /await commitCreditReservation\(session\.user\.id,reservationRef,\{kind:'image',images:stored\}\);imageSettlementStarted=true;await finishOperation/);
});

test('agent reservation cleanup only releases a reservation created by this request', () => {
  assert.match(app, /let reservation; let ownsReservation=false; let reservationSettled=false/);
  assert.match(app, /if\(ownsReservation&&!reservationSettled\)await releaseCreditReservation/);
  assert.match(app, /await commitCreditReservation\(userId,reference,result\);reservationSettled=true;\}await finishOperation/);
});
