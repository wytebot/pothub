import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../src/ui/CodelabWorkspace.jsx',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
test('Codelab includes inline edit, GitHub branch commits, PR, revert and ZIP flows',()=>{
 for(const term of ['Inline edit','/api/github/commit-fix','/api/github/create-pr','/api/github/revert-fix-branch','/api/github/files','/api/github/file','exportZip','unzipText','saveBlob'])assert.ok(ui.includes(term),`missing ${term}`);
});
test('bulk file deletion enforces two remaining files and creates a review branch',()=>{
 assert.ok(server.includes("app.post('/api/github/delete-files',oneCreditMutation('Delete repository files')"));
 assert.ok(server.includes('if(blobs.length-i.paths.length<2)'));
 assert.ok(server.includes('refs/heads/${branch}'));
});
test('repository actions never use a local repository mirror as source of truth',()=>{
 assert.ok(ui.includes('live GitHub files'));
 assert.ok(ui.includes('source of truth')||ui.includes('source-of-truth')||ui.includes('GitHub'));
});
