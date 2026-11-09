import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('Creator chat exposes an explicit Stop action and aborts its active request', async () => {
  const app = await read('src/ui/App.jsx');
  const workspace = await read('src/ui/WorkspaceSection.jsx');
  assert.match(app, /let activeCreatorChatController=null/);
  assert.match(app, /signal:controller\.signal/);
  assert.match(app, /async function stopCreatorChat\(\)\{if\(activeCreatorChatController&&!activeCreatorChatController\.signal\.aborted\)activeCreatorChatController\.abort\(\)/);
  assert.match(app, /stopCreatorChat,setAgentFn/);
  assert.match(workspace, /aria-label=\{\['chat','image','video','chain'\]\.includes\(busy\)\?'Stop workflow'/);
  assert.match(app, /if\(!controller\.signal\.aborted&&e\?\.name!=='AbortError'/);
});

test('Creator API helper preserves external cancellation alongside its request timeout', async () => {
  const app = await read('src/ui/App.jsx');
  assert.match(app, /signal:externalSignal/);
  assert.match(app, /AbortSignal\.any\(\[ctrl\.signal,externalSignal\]\)/);
});

test('server cancels abortable AI provider requests when a client disconnects', async () => {
  const server = await read('server/app.js');
  assert.match(server, /req\.pothubAbortController=new AbortController\(\)/);
  assert.match(server, /res\.once\('close',\(\)=>\{if\(!res\.writableEnded\)req\.pothubAbortController\?\.abort/);
  assert.match(server, /function requestSignal\(req,capMs=40000\).*AbortSignal\.any/);
  assert.match(server, /const signal=\(\)=>requestSignal\(req,Math\.max\(1,Math\.min\(capMs,remainingMs\(\)\)\)\)/);
});
