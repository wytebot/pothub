import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../src/ui/WorkspaceSection.jsx',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
const lib=fs.readFileSync(new URL('../server/lib.js',import.meta.url),'utf8');
test('Codelab passes uploaded attachment IDs and size to the server agent loop',()=>{
  assert.match(app,/attachments:\(payload\.attachments\|\|\[\]\)\.map\(a=>\(\{name:a\.name,type:a\.type,size:a\.size,textContent:a\.textContent\|\|'',\.\.\.\(a\.dataUrl\?\{dataUrl:a\.dataUrl\}:\{\}\),\.\.\.\(a\.uploadId\?\{uploadId:a\.uploadId\}:\{\}\)\}\)\)/);
  assert.match(workspace,/uploadLargeAttachment\(f,progress=>setEditProgress\(`Uploading \$\{f\.name\} · \$\{progress\.percent\|\|0\}%`\)\)/);
});
test('server validates upload ownership, expiry and exact declared size before reading Codelab text',()=>{
  assert.match(server,/uploadSnap\.data\(\)\?\.state!=='complete'/);
  assert.match(server,/Number\(uploadSnap\.data\(\)\?\.sizeExpected\)!==Number\(a\.size\)/);
  assert.match(server,/readUserUploadedText\(\{userId:s\.user\.id,path:uploadRow\.path,maxChars:60000,maxBytes:1024\*1024\}\)/);
  assert.match(lib,/user-uploads\/\$\{uidHash\}\//);
  assert.match(lib,/const cap=Math\.max\(1024,Math\.min\(Number\(maxBytes\)\|\|1024\*1024,1024\*1024\)\)/);
});
test('long repository prompts are sent as typed (no PDF conversion cap) and attachment text stays the model context',()=>{
  assert.doesNotMatch(workspace,/rawText\.length>8000/);
  assert.match(workspace,/typeof f\.pothubTextContent==='string'/);
  assert.match(app,/function makeTextPdfAttachment\(source\)/);
});
test('Codelab image attachments are forwarded only to vision-capable configured agents',()=>{
  assert.match(app,/dataUrl:a\.dataUrl/);
  assert.match(server,/const imageParts=\(i\.attachments\|\|\[\]\)\.filter\(a=>a\.dataUrl/);
  assert.match(server,/savedCandidates\.filter\(c=>providerById\(c\.provider\)\?\.capabilities\?\.includes\('vision'\)\)/);
  assert.match(server,/extraParts:imageParts/);
});
test('production CI includes an Android debug build gate before deployment',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/vercel-production-deploy.yml',import.meta.url),'utf8');
  assert.match(workflow,/npm run android:configure/);
  assert.match(workflow,/gradlew --no-daemon assembleDebug/);
  assert.match(workflow,/NEXT_PUBLIC_API_BASE/);
});
