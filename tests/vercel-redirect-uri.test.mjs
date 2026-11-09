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

test('Vercel redirect URI honors VERCEL_REDIRECT_URI before the built-in fallback',()=>{
 const start=app.indexOf('function vercelRedirectSource(req)');
 const end=app.indexOf('function vercelRedirectSourceFromEnv(req)',start);
 const source=app.slice(start,end);
 assert.match(source,/VERCEL_REDIRECT_URI_OVERRIDE/);
 assert.match(source,/vercelRedirectSourceFromEnv\(req\)/);
 assert.doesNotMatch(source,/return \{value:HARDCODED_VERCEL_REDIRECT_URI,source:'built-in \(hard-coded in server\/app\.js\)'\}/);
});
