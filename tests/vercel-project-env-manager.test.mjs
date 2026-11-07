import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('Vercel GitHub import verifies the repository and uses the connected Vercel account', async()=>{
  const source=await read('../server/app.js');
  assert.match(source,/app\.post\('\/api\/vercel\/import-github'/);
  assert.match(source,/if\(!s\.githubToken\).*Connect GitHub/s);
  assert.match(source,/gitRepository:\{type:'github',repo:input\.repoFullName\}/);
  assert.match(source,/v11\/projects/);
  assert.match(source,/selectedProjectId:id/);
});

test('Vercel environment variable writes are bounded, validated, and never echo values', async()=>{
  const source=await read('../server/app.js');
  const route=source.slice(source.indexOf("app.post('/api/vercel/environment-variables'"),source.indexOf("// Vercel Backend Manager"));
  assert.match(route,/variables:z\.array/);
  assert.match(route,/\.max\(100\)/);
  assert.match(route,/upsert:'true'/);
  assert.match(route,/type:variable\.secret\?'encrypted':'plain'/);
  assert.match(route,/savedKeys:saved/);
  assert.doesNotMatch(route,/res\.json\(\{[^}]*value:variable\.value/);
});

test('Vercel workspace offers GitHub import, variable editor, and direct dashboard access', async()=>{
  const source=await read('../src/ui/VercelBackendWorkspace.jsx');
  assert.match(source,/Import a GitHub repository/);
  assert.match(source,/Manage variables/);
  assert.match(source,/Save & deploy/);
  assert.match(source,/Manage environment variables directly in Vercel/);
  assert.match(source,/type=\"password\"/);
});

test('chat requests are persisted before provider execution and edited in place', async()=>{
  const source=await read('../src/ui/App.jsx');
  const send=source.slice(source.indexOf('async function sendMessage('),source.indexOf('function stopCreatorChat'));
  assert.ok(send.indexOf('db.messages.bulkPut') < send.indexOf('functionAgents'));
  assert.match(send,/editTargetId\?messages\.findIndex/);
  assert.match(send,/const next=\[\.\.\.baseMessages,enrichedUserMsg,finalAssistant\]/);
  assert.match(source,/function stopCreatorChat\(\)\{if\(activeCreatorChatController/);
});

test('repo chat ZIP attachments expose an explicit GitHub commit action', async()=>{
  const source=await read('../src/ui/WorkspaceSection.jsx');
  assert.match(source,/Commit ZIP to GitHub/);
  assert.match(source,/api\('\/api\/github\/agent\/commit-approved'/);
  assert.match(source,/zip\.files/);
});

test('repository paths normalize harmless ./ and Windows separators without allowing traversal', async()=>{
  const {normalizeRepoPath}=await import('../server/wytelab-github.js');
  assert.equal(normalizeRepoPath('./src/App.jsx'),'src/App.jsx');
  assert.equal(normalizeRepoPath('src\\components\\Button.jsx'),'src/components/Button.jsx');
  assert.equal(normalizeRepoPath('src//components/./Button.jsx'),'src/components/Button.jsx');
  for(const path of ['../secret.env','src/../../secret','/etc/passwd','C:\\Windows\\win.ini',''])assert.throws(()=>normalizeRepoPath(path),{code:'INVALID_REPOSITORY_PATH'});
});

test('streamed creator responses default to English and use the shared all-request response protocol', async()=>{
  const source=await read('../server/app.js');
  const stream=source.slice(source.indexOf("app.post('/api/agent/chat/stream'"),source.indexOf("app.post('/api/agent/chat'"));
  assert.match(stream,/Use English by default unless the user explicitly requests another language/);
  assert.match(stream,/creatorPrompt=withEngineeringProtocol\(`You are PotHub Creator/);
  assert.match(stream,/For substantial requests of any kind, explain what you understood/);
  assert.match(stream,/evidence-based root-cause analysis/);
});

test('composer preserves and previews attachments, uses the keyboard viewport, and stops media workflows', async()=>{
  const app=await read('../src/ui/App.jsx'),workspace=await read('../src/ui/WorkspaceSection.jsx'),css=await read('../src/ui/styles.css');
  assert.match(app,/db\.attachments\.put\(\{id:attachmentIds\.get\(f\)/);
  assert.match(workspace,/URL\.createObjectURL\(f\)/);
  assert.match(workspace,/Stop workflow/);
  assert.match(app,/visualViewport\?\.addEventListener\('resize'/);
  assert.match(css,/position:sticky;bottom:var\(--pothub-keyboard-inset/);
});

test('logs menu covers GitHub Actions and Vercel deployment failures with a repo-chat repair handoff', async()=>{
  const source=await read('../src/ui/App.jsx');
  assert.match(source,/Build logs/);
  assert.match(source,/Vercel deployments/);
  assert.match(source,/Fix this build/);
  assert.match(source,/Build logs:\s*\$\{buildLogs\.slice\(-16000\)\}/);
});

test('Vercel backend workspace avoids load-effect loops and preserves environment variable names', async()=>{
  const source=await read('../src/ui/VercelBackendWorkspace.jsx');
  assert.match(source,/const apiRef=React\.useRef\(api\);apiRef\.current=api/);
  assert.match(source,/\},\[\]\);\s*React\.useEffect\(\(\)=>\{load\(\);apiRef\.current/);
  assert.match(source,/key:x\.key\.trim\(\),value:x\.value/);
  assert.ok(source.indexOf('const selectedProject=projects.find')<source.indexOf('const envDashboardUrl=selectedProject'));
});

test('image-generation requests persist references and pass compressed image parts to Gemini', async()=>{
  const app=await read('../src/ui/App.jsx'),server=await read('../server/app.js');
  assert.match(app,/attachments:imageInputs/);
  assert.match(app,/db\.attachments\.put\(\{id:imageAttachmentIds\.get\(f\)/);
  assert.match(server,/attachments:z\.array\(z\.object\(\{name:z\.string\(\)\.max\(255\)/);
  assert.match(server,/inlineData:\{mimeType:a\.type,data:a\.dataUrl\.split\(','\)\[1\]\}/);
});
