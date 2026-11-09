import test from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSE_STYLES, responseStyleFragment, responseConstraintIssues } from '../server/response-styles.js';

test('response style table covers the requested common response types',()=>{
  for(const id of ['summarize','translate','rewrite','explain','compare','debug','table','checklist','schedule','email','cover-letter','report','fact-check','continue'])assert.ok(RESPONSE_STYLES.some(s=>s.id===id),`Missing ${id}`);
  assert.match(responseStyleFragment('Please summarize this and list key takeaways'),/Summarize faithfully/);
  assert.match(responseStyleFragment('Debug this error'),/most likely cause/);
});
test('final guard checks explicit word, bullet, JSON and CSV constraints',()=>{
  assert.deepEqual(responseConstraintIssues('Explain under 3 words','This is too long.'),['Keep the answer under 3 words.']);
  assert.deepEqual(responseConstraintIssues('Answer in 2 bullets','- one\n- two'),[]);
  assert.ok(responseConstraintIssues('Return as JSON','not json').some(x=>x.includes('valid JSON')));
  assert.ok(responseConstraintIssues('Export as CSV','just prose','csv').some(x=>x.includes('CSV')));
});
