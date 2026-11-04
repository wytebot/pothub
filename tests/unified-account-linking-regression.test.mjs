import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
const lib=fs.readFileSync(new URL('../server/lib.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../src/ui/WorkspaceSection.jsx',import.meta.url),'utf8');
test('GitHub linking is bound to a signed-in Google account and persists encrypted credentials',()=>{
 assert.match(app,/app\.post\('\/api\/auth\/link-ticket'/);
 assert.match(app,/authProvider!=='google'/);
 assert.match(app,/githubConnectionRef\(userId\)\.set\(\{githubId/);
 assert.match(app,/tokenEncrypted:encryptWorkspaceSecret\(td\.access_token\)/);
 assert.match(lib,/hydrateLinkedAccounts/);
 assert.match(lib,/collection\('github_connections'\)/);
});
test('Vercel OAuth can use a one-time Google-account ticket for Capacitor and returns to the app',()=>{
 assert.match(app,/app\.get\('\/api\/vercel\/connect'/);
 assert.match(app,/req\.query\.native==='1'&&req\.query\.link_ticket/);
 assert.match(app,/saved\.native\)return res\.redirect\('ai\.pothub\.app:\/\/auth\?linked=vercel'\)/);
 assert.match(workspace,/api\/auth\/link-ticket/);
 assert.match(workspace,/api\/vercel\/connect\?native=1&link_ticket=/);
 assert.match(ui,/linked==='vercel'/);
});
test('GitHub linking from the workspace no longer starts an independent GitHub login',()=>{
 assert.match(ui,/Sign in with Google first, then connect GitHub from Codelab/);
 assert.match(ui,/api\/auth\/github\?link=1/);
 assert.doesNotMatch(ui,/preferred-role',value:'Developer'/);
});
