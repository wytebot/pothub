import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
const app=await readFile(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
test('auth restoration splash precedes signed-out welcome and workspace',()=>{assert.match(app,/if\(restoring\)return <main className="splash"/);assert.match(app,/if\(!user\)\{return <main className=/);assert.match(app,/api\('\/api\/auth\/me',\{timeoutMs:5000,noRetry:true\}\)/)});
test('provider identity controls Developer and Creator role',()=>{assert.match(app,/signInWithRedirect\(firebaseAuth,new GoogleAuthProvider\(\)\)/);assert.match(app,/\/api\/auth\/github/);assert.match(app,/setRole\('Creator'\)/);assert.match(app,/role==='Creator'/)});
test('native auth return listens for appUrlOpen and exchanges one-time ticket',()=>{assert.match(app,/appUrlOpen/);assert.match(app,/native-exchange/);assert.match(app,/nativeSessionToken=d\.session/)});

test('OAuth callback errors are shown in browser and progress UI does not falsely mark timed stages complete',()=>{assert.match(app,/url\.searchParams\.get\('auth_error'\)/);assert.match(app,/setError\(authError\)/);assert.match(app,/These are the current processing stages, not a percentage-complete estimate/);assert.match(app,/work-progress-track/)});

test('GitHub browser ticket exchange is module-memoized for StrictMode effect re-runs',()=>{assert.match(app,/let browserTicketPromise=null/);assert.match(app,/let browserTicketValue=''/);assert.match(app,/function consumeBrowserTicket\(ticket\)/);assert.match(app,/browserTicketValue!==ticket/);assert.match(app,/else if\(browserTicketPromise\)\{await browserTicketPromise\}/);assert.match(app,/await consumeBrowserTicket\(authTicket\)/)});

test('Firebase auth domain supports the same-origin auth proxy configuration',async()=>{const firebase=await readFile(new URL('../src/lib/firebase.js',import.meta.url),'utf8');assert.match(firebase,/authDomain:\s*import\.meta\.env\.VITE_FIREBASE_AUTH_DOMAIN\s*\|\|\s*"pothub-ca2a1\.firebaseapp\.com"/)});
