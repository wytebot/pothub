import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
const app=await readFile(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
test('auth restoration splash precedes signed-out welcome and workspace',()=>{assert.match(app,/if\(restoring\)return <main className="splash"/);assert.match(app,/if\(!user\)\{return <main className=/);assert.match(app,/api\('\/api\/auth\/me',\{timeoutMs:5000,noRetry:true\}\)/)});
test('provider identity controls Developer and Creator role',()=>{assert.match(app,/signInWithRedirect\(firebaseAuth,new GoogleAuthProvider\(\)\)/);assert.match(app,/\/api\/auth\/github/);assert.match(app,/setRole\('Creator'\)/);assert.match(app,/role==='Creator'/)});
test('native auth return listens for appUrlOpen and exchanges one-time ticket',()=>{assert.match(app,/appUrlOpen/);assert.match(app,/native-exchange/);assert.match(app,/nativeSessionToken=d\.session/)});

test('OAuth callback errors are shown in browser and progress UI does not falsely mark timed stages complete',()=>{assert.match(app,/url\.searchParams\.get\('auth_error'\)/);assert.match(app,/setError\(authError\)/);assert.match(app,/These are the current processing stages, not a percentage-complete estimate/);assert.match(app,/work-progress-track/)});

test('GitHub browser ticket exchange is module-memoized for StrictMode effect re-runs',()=>{assert.match(app,/let browserTicketPromise=null/);assert.match(app,/let browserTicketValue=''/);assert.match(app,/function consumeBrowserTicket\(ticket\)/);assert.match(app,/browserTicketValue!==ticket/);assert.match(app,/else if\(browserTicketPromise\)\{await browserTicketPromise\}/);assert.match(app,/await consumeBrowserTicket\(authTicket\)/)});

test('Firebase auth domain supports the same-origin auth proxy configuration',async()=>{const firebase=await readFile(new URL('../src/lib/firebase.js',import.meta.url),'utf8');assert.match(firebase,/authDomain:\s*process\.env\.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN\s*\|\|\s*"pothub-ca2a1\.firebaseapp\.com"/)});

test('browser OAuth callbacks establish opaque cookie sessions and redirect straight back to the app',async()=>{const server=await readFile(new URL('../server/app.js',import.meta.url),'utf8');const lib=await readFile(new URL('../server/lib.js',import.meta.url),'utf8');assert.match(server,/await setBrowserSession\(res,sessionData\);res\.setHeader\('Cache-Control','no-store'\);res\.redirect\(authFrontendUrl\(req,\{connected:'github'\}\)\)/);assert.match(server,/await setBrowserSession\(res,googleSession\)/);assert.match(server,/json\(\{ok:true,session,user:profile,credits:balance\.credits,authProvider:'google'\}\)/);assert.match(lib,/pothub_sid=\$\{sid\}/);assert.match(lib,/browser_sessions/);assert.match(lib,/createHash\('sha256'\)\.update\(sid\)/)});
test('Google and GitHub browser sessions restore through /api/auth/me without a frontend token',async()=>{const appServer=await readFile(new URL('../server/app.js',import.meta.url),'utf8');const ui=await readFile(new URL('../src/ui/App.jsx',import.meta.url),'utf8');assert.match(appServer,/app\.get\('\/api\/auth\/me'/);assert.match(appServer,/await setBrowserSession\(res,sessionData\)/);assert.match(ui,/credentials:'include'/);assert.match(ui,/connectedProvider=authUrl\.searchParams\.get\('connected'\)/);assert.match(ui,/sessionStorage\.removeItem\('pothub-session-v1'\)/)});

test('Google session endpoint returns the opaque ID created by the shared cookie-session helper', async () => {
  const appServer = await readFile(new URL('../server/app.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  assert.match(appServer, /const sessionData=\{user:profile,authProvider:'google',firebaseUid:decoded.uid,createdAt:Date.now\(\)\}/);
  assert.match(appServer, /const session=await setBrowserSession\(res,sessionData\)/);
  assert.match(appServer, /res\.json\(\{ok:true,session,user:profile,credits:balance\.credits,authProvider:'google'\}\)/);
  assert.match(ui, /if\(session\.session\)\{webSessionToken=session\.session/);
});

test('Firebase redirect callback is processed only after an explicitly marked Google redirect return',async()=>{const ui=await readFile(new URL('../src/ui/App.jsx',import.meta.url),'utf8');assert.match(ui,/function isGoogleRedirectPending\(\).*sessionStorage\.getItem\(GOOGLE_REDIRECT_PENDING\)==='1'/);assert.match(ui,/if\(!isGoogleRedirectPending\(\)\|\|!isGoogleRedirectReturn\(\)\)/);assert.match(ui,/markGoogleRedirectPending\(\);setGoogleRedirectMarker\(true\);await signInWithRedirect/);assert.match(ui,/clearGoogleRedirectState\(\);showError\(redirectError\)/)});

test('Developer login clears Google redirect state and only a marked Google return can call the Google session endpoint',()=>{assert.match(app,/const GOOGLE_REDIRECT_MARKER='pothub_google_redirect'/);assert.match(app,/function isGoogleRedirectReturn\(\).*GOOGLE_REDIRECT_MARKER/);assert.match(app,/if\(!isGoogleRedirectPending\(\)\|\|!isGoogleRedirectReturn\(\)\)/);assert.match(app,/if\(provider==='github'\)\{[\s\S]*?clearGoogleRedirectState\(\);googleRedirectPromise=null;/);assert.match(app,/markGoogleRedirectPending\(\);setGoogleRedirectMarker\(true\);await signInWithRedirect/)});
