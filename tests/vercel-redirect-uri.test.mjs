import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
const docs=fs.readFileSync(new URL('../ENVIRONMENT_VARIABLES.md',import.meta.url),'utf8');
test('Vercel OAuth callback uses an explicit validated HTTPS callback URI',()=>{
 assert.match(app,/function vercelRedirectUri\(req\)/);
 assert.match(app,/process\.env\.VERCEL_REDIRECT_URI/);
 assert.match(app,/target\.pathname!=='\/api\/vercel\/callback'/);
 assert.match(app,/redirectUri=vercelRedirectUri\(req\)/);
 assert.doesNotMatch(app,/NEXT_PUBLIC_VERCEL_APP_CLIENT_ID/);
 assert.match(docs,/VERCEL_REDIRECT_URI/);
 assert.match(docs,/must match exactly/);
});
