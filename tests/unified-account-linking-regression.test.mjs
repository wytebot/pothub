import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
const lib=fs.readFileSync(new URL('../server/lib.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../src/ui/WorkspaceSection.jsx',import.meta.url),'utf8');
test('GitHub linking is bound to the signed-in PotHub account and persists encrypted credentials',()=>{
 assert.match(app,/app\.post\('\/api\/github\/link-ticket'/);
 assert.match(app,/authProvider:String\(session\.authProvider\|\|'pothub'\)/);
 assert.match(app,/githubConnectionRef\(userId\)\.set\(\{githubId/);
 assert.match(app,/tokenEncrypted:encryptWorkspaceSecret\(td\.access_token\)/);
 assert.match(lib,/hydrateLinkedAccounts/);
 assert.match(lib,/collection\('github_connections'\)/);
});
test('Vercel OAuth can use a one-time Google-account ticket for Capacitor and returns to the app',()=>{
 assert.match(app,/app\.get\('\/api\/vercel\/connect'/);
 assert.match(app,/native:req\.query\.native==='1'/);
 assert.match(app,/if\(req\.query\.link_ticket\)/);
 assert.match(app,/saved\.native\)return res\.redirect\('ai\.pothub\.app:\/\/auth\?linked=vercel'\)/);
 assert.match(ui,/api\('\/api\/vercel\/link-ticket'/);
 assert.match(ui,/api\/vercel\/connect\?\$\{native\(\)\?'native=1&':''\}link_ticket=/);
 assert.match(ui,/linked==='vercel'/);
});
test('GitHub and Vercel support independent sign-in while explicit linking remains account-bound',()=>{
 assert.match(app,/app\.get\('\/api\/auth\/vercel'/);
 assert.match(app,/authMode:'login'/);
 assert.match(app,/saved\.authMode==='login'\?`vercel_/);
 assert.match(ui,/window\.location\.assign\(`\$\{authBase\}\/api\/auth\/github`\)/);
 assert.match(ui,/window\.location\.assign\(`\$\{authBase\}\/api\/auth\/vercel\$\{forceReauth/);
 assert.match(ui,/setRole\(me\.authProvider==='github'\?'Developer':'Creator'\)/);
 assert.match(app,/linkRequested&&!existing\?\.user\?\.id/);
});
test('Vercel independent sign-in creates a provider-scoped identity and uses shared one-time session exchange',()=>{
 assert.match(app,/app\.get\('\/api\/auth\/vercel'/);
 assert.match(app,/authMode:'login'/);
 assert.match(app,/`vercel_\$\{String\(profile\.sub\)\}`/);
 assert.match(app,/session\.authProvider!=='vercel'/);
 assert.match(app,/session\.authProvider!=='vercel'/);
 assert.match(ui,/login\('vercel'\)/);
});
