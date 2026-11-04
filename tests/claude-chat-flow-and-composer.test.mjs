import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest } from '../src/lib/request-intent.js';
import { buildOutputFile } from '../src/lib/output-files.js';
import { responseConstraintIssues } from '../server/response-styles.js';

test('creator request classification preserves chat for analysis and routes direct media commands',()=>{
 assert.equal(classifyRequest('Generate an image of a cat').task,'image');
 assert.equal(classifyRequest('How do I generate an image in Python?').task,'chat');
 assert.equal(classifyRequest('Give me a prompt for a logo').task,'chat');
});
test("explicit answer constraints are checked without changing the user's requested content",()=>{
 assert.deepEqual(responseConstraintIssues('Answer in 3 bullets','- one\n- two\n- three'),[]);
 assert.ok(responseConstraintIssues('Keep it under 5 words','This answer has more than five words.').length>0);
});
test('text and CSV exports preserve text and use an Excel-compatible UTF-8 BOM for CSV only',async()=>{
 const txt=await buildOutputFile('txt','# Hello\n\nA useful answer.');
 const csv=await buildOutputFile('csv','```csv\nname,value\nAlice,2\n```');
 assert.ok(txt&&csv);assert.equal(txt.data.charCodeAt(0),72);assert.equal(csv.data.charCodeAt(0),0xFEFF);
 assert.match(csv.data,/Alice,2/);
});
