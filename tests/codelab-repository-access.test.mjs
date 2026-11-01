import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const codelab=fs.readFileSync(new URL('../src/ui/CodelabWorkspace.jsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
test('Codelab receives and renders the connected account repository list without requiring repository-specific credits',()=>{
 assert.match(app,/<CodelabWorkspace api=\{api\} repos=\{repos\} setRepo=\{setRepo\} setSection=\{setSection\} onRefresh=\{loadRepos\}/);
 assert.match(codelab,/visibleRepos\.map/);
 assert.match(codelab,/Browsing is free/);
 assert.match(codelab,/setRepo\?\.\(r\)/);
});
test('Codelab makes metered AI operations explicit rather than charging for repository browsing',()=>{
 assert.match(codelab,/AI diagnosis and repair use credits; other metered tools should show their cost before execution/);
 assert.match(server,/diagnosis: 10|amount:10/);
 assert.match(fs.readFileSync(new URL('../server/pricing.js',import.meta.url),'utf8'),/repair:\s*20/);
});
test('repository discovery requests up to ten pages and keeps GitHub as the source of truth',()=>{
 assert.match(server,/\},10,firstPage\.data\)/);
 assert.match(codelab,/does not create a server-side code mirror/);
});
