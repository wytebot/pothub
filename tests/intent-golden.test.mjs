import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyRequest } from '../src/lib/request-intent.js';
import { OUTPUT_FORMATS } from '../src/lib/intent-lexicon.js';

const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/intent-golden.json', import.meta.url), 'utf8'));
const expectedFormats = [...OUTPUT_FORMATS].sort();
const serverSource = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');

test('golden set has 300+ labelled prompts, multilingual categories, and both polarities', () => {
  assert.ok(rows.length >= 300, `Expected 300+ prompts, got ${rows.length}`);
  assert.ok(new Set(rows.map(r => r.language)).size >= 17);
  for (const label of ['image','video','edit','file','chat']) assert.ok(rows.some(r => r.label === label), `Missing ${label}`);
  for (const language of new Set(rows.map(r => r.language))) {
    assert.ok(rows.some(r => r.language === language && r.label === 'chat'), `No negative cases for ${language}`);
  }
});

test('golden-set image/video/file/edit precision and recall stay above 99%, media false positives below 1%', () => {
  const metrics = {};
  for (const label of ['image','video','file','edit']) {
    let tp=0, fp=0, fn=0;
    for (const row of rows) {
      const out=classifyRequest(row.prompt,{attachments:row.attachments||[]});
      const actual = row.category==='file-request' ? (out.fileFormat ? 'file' : 'chat') : (out.operation==='edit'?'edit':out.task);
      if(actual===label && row.label===label) tp++;
      else if(actual===label && row.label!==label) fp++;
      else if(actual!==label && row.label===label) fn++;
    }
    metrics[label]={precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),tp,fp,fn};
    assert.ok(metrics[label].precision >= 0.99, `${label} precision ${(metrics[label].precision*100).toFixed(2)}%`);
    assert.ok(metrics[label].recall >= 0.99, `${label} recall ${(metrics[label].recall*100).toFixed(2)}%`);
  }
  const negativeMedia=rows.filter(r=>r.label==='chat');
  const falsePositives=negativeMedia.filter(r=>{const o=classifyRequest(r.prompt,{attachments:r.attachments||[]});return ['image','video'].includes(o.task)||o.operation==='edit'}).length;
  assert.ok(falsePositives/negativeMedia.length < 0.01, `Media false-positive rate ${(falsePositives/negativeMedia.length*100).toFixed(2)}%`);
  console.log('[intent golden metrics]',JSON.stringify(metrics),'media false-positive rate',falsePositives/negativeMedia.length);
});

test('server accepts every classifier output format (open extension schema, no stale enum)', () => {
  const match=serverSource.match(/outputFormat:z\.string\(\)\.regex\((\/[^/]+\/)\)/);
  assert.ok(match,'server outputFormat schema is an extension pattern');
  const rx=new RegExp(match[1].slice(1,-1));
  for(const format of expectedFormats)assert.match(format,rx,`server rejects ${format}`);
});
