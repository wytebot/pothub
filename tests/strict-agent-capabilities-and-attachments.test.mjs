import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');

test('repair capability maps to the configured Fix generation function', () => {
  assert.match(app, /const TASK_FUNCTION=\{[^}]*repair:'Fix generation'/);
});

test('client does not borrow sibling Chat/Diagnosis/Fix agents as cross-function fallbacks', () => {
  assert.match(app, /configured function is an explicit capability boundary/i);
  assert.match(app, /const eligible=\(Array\.isArray\(rows\)\?rows:\[\]\)\.filter\(row=>String\(row\.function\|\|''\)\.toLowerCase\(\)===String\(fn\)\.toLowerCase\(\)\)/);
  assert.doesNotMatch(app, /const siblings=\(await db\.agents\.toArray\(\)\)/);
});

test('server selects only exact task agents or explicitly universal agents', () => {
  assert.match(server, /normalizedTask==='all'\|\|normalizedTask===normalizeTask\(want\)/);
  assert.doesNotMatch(server, /\['chat','diagnosis','fix generation','fix'\]\.includes\(taskName\)/);
});

test('streaming chat schema accepts bounded attachments and passes image parts to configured models', () => {
  assert.match(server, /attachments:z\.array\(z\.object\(/);
  assert.match(server, /dataUrl:z\.string\(\)\.max\(1400000\)/);
  assert.match(server, /uploadId:z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(server, /uploaded attachment could not be verified/i);
  assert.match(server, /streamConfiguredText\(candidate,creatorPrompt,[\s\S]*?controller\.signal,extraParts\)/);
  assert.match(server, /attachmentText/);
  assert.match(app, /attachments:attachmentPayload\.length\?attachmentPayload\.map/);
  assert.match(app, /:\(userMsg\.attachments\|\|\[\]\)/);
  assert.match(app, /async function uploadLargeAttachment\(file(?:,|\))/);
  assert.match(app, /uploadLargeAttachment\(f(?:,|\))/);
});
