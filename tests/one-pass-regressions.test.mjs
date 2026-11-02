import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authDomainForHost, validGithubRepositoryName, validGitBranchRef } from '../src/lib/auth-domain.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
test('A2 Firebase auth domain is same-origin on public hosts so redirect sign-in survives storage partitioning', () => {
  assert.equal(authDomainForHost('pothub-self.vercel.app'), 'pothub-self.vercel.app');
  assert.equal(authDomainForHost('pothub.example.com'), 'pothub.example.com');
  assert.equal(authDomainForHost('localhost'), 'pothub-ca2a1.firebaseapp.com');
  assert.equal(authDomainForHost('192.168.1.5'), 'pothub-ca2a1.firebaseapp.com');
  assert.equal(authDomainForHost(''), 'pothub-ca2a1.firebaseapp.com');
  assert.equal(authDomainForHost('pothub.example.com', 'auth.example.com'), 'auth.example.com');
  assert.equal(authDomainForHost('pothub-self.vercel.app', 'pothub-ca2a1.firebaseapp.com'), 'pothub-self.vercel.app');
});
test('B3 GitHub repository name validation rejects special and .git names', () => {
  assert.equal(validGithubRepositoryName('my-app'), true);
  assert.equal(validGithubRepositoryName('.'), false);
  assert.equal(validGithubRepositoryName('..'), false);
  assert.equal(validGithubRepositoryName('project.git'), false);
});
test('B4 branch refs allow slash-separated names but reject unsafe path segments', () => {
  assert.equal(validGitBranchRef('release/x'), true);
  assert.equal(validGitBranchRef('feature/fix-2'), true);
  assert.equal(validGitBranchRef('../main'), false);
  assert.equal(validGitBranchRef('release//x'), false);
});
test('A3 redirect restore uses localStorage TTL and actionable marker error', async () => {
  const app = await read('src/ui/App.jsx');
  assert.match(app, /localStorage\.setItem\(GOOGLE_REDIRECT_PENDING/);
  assert.match(app, /expiresAt:Date\.now\(\)\+10\*60\*1000/);
  assert.match(app, /Google returned to PotHub without an authenticated account/);
  assert.match(app, /await firebaseAuth\.authStateReady\(\)/);
});
test('A4 Firebase exchanges are single-flight by ID token and Google provider can restore role', async () => {
  const app = await read('src/ui/App.jsx');
  assert.match(app, /firebaseExchangeFlights\.has\(idToken\)/);
  assert.match(app, /providerId==='google\.com'/);
});
test('A6 browser exchange supports HttpOnly cookie sessions and encrypts GitHub token at rest', async () => {
  const server = await read('server/app.js');
  const lib = await read('server/lib.js');
  assert.match(server, /cookieSession:sameOrigin/);
  assert.match(server, /githubTokenEncrypted:encryptWorkspaceSecret/);
  assert.match(lib, /decryptWorkspaceSecret\(session\.githubTokenEncrypted\)/);
});
test('A8 native auth exchange is rate limited and native URL handling is scheme-guarded', async () => {
  const server = await read('server/app.js');
  const app = await read('src/ui/App.jsx');
  assert.match(server, /app\.post\('\/api\/auth\/native-exchange',authLimit/);
  assert.match(app, /parsed\.protocol!=='ai\.pothub\.app:'/);
  assert.match(app, /CapacitorApp\.getLaunchUrl\(\)/);
});
test('A12 GitHub OAuth no longer requests read:org', async () => {
  const server = await read('server/app.js');
  assert.match(server, /scope','repo read:user user:email'/);
  assert.doesNotMatch(server, /scope','repo read:user user:email read:org'/);
});
test('A13 auth errors are not automatically dismissed and global handlers preserve error detail', async () => {
  const app = await read('src/ui/App.jsx');
  assert.match(app, /e\?\.reason\?\.message/);
  assert.match(app, /sign-in\|sign in\|oauth\|google\|github\|auth\|session\|redirect/);
});
test('B8 developer-intent questions are not refused by off-topic keyword alone', async () => {
  const server = await read('server/app.js');
  assert.match(server, /\(!developerIntent&&explicitOffTopic\)/);
});
test('C2 assistant replies regenerate from preceding user message and only user messages can be edited', async () => {
  const ui = await read('src/ui/WorkspaceSection.jsx');
  assert.match(ui, /m\.role==='assistant'.*Regenerate/s);
  assert.match(ui, /m\.role==='user'.*Edit/s);
});
test('C4 composers respect IME composition and touch keyboard newline behavior', async () => {
  const ui = await read('src/ui/WorkspaceSection.jsx');
  assert.match(ui, /e\.nativeEvent\?\.isComposing/);
  assert.match(ui, /\(pointer: coarse\)/);
});
test('C11 service worker build stamp is independent of a hard-coded shell version', async () => {
  const script = await read('scripts/stamp-service-worker.mjs');
  assert.match(script, /replace\(\/const CACHE = '\[\^'\]\*';\//);
});
test('C13 Capacitor build refuses to ship without a configured API origin and skips SW in native shell', async () => {
  const build = await read('scripts/build-capacitor.mjs');
  const page = await read('pages/index.jsx');
  assert.match(build, /NEXT_PUBLIC_API_BASE is required/);
  assert.match(page, /Capacitor\.isNativePlatform\(\)/);
});

test('Creator chat hides stale configure-agent prompt when a compatible creator agent exists and groups history by date', async () => {
  const ui = await read('src/ui/WorkspaceSection.jsx');
  assert.match(ui, /missingAgentFunction&&!\(role==='Creator'&&agents\.some/);
  assert.match(ui, /chat-history-group-title/);
  assert.match(ui, /creator-chat-header/);
});
test('API page lock configures a native fallback passcode and keeps browser passkeys server-verified', async () => {
  const biometric = await read('src/lib/biometric.js');
  const agents = await read('src/ui/AgentsWorkspace.jsx');
  assert.match(biometric, /async function browserRegister\(ownerId\)/);
  assert.match(biometric, /const fallback = await setupPin\(ownerId, requestPasscode\)/);
  assert.match(biometric, /if \(row\?\.pinHash \|\| row\?\.serverVerified\) return verifyPin\(ownerId, requestPasscode\)/);
  assert.match(agents, /one authenticator/);
  assert.match(agents, /secure local fallback passcode/);
});
test('Firebase config derives authDomain from the page host and vercel.json proxies the handler', async () => {
  const firebase = await read('src/lib/firebase.js');
  const vercel = JSON.parse(await read('vercel.json'));
  assert.match(firebase, /authDomain: authDomainForHost/);
  assert.ok(vercel.rewrites.some(r => r.source === '/__/auth/:path*' && /pothub-ca2a1\.firebaseapp\.com\/__\/auth/.test(r.destination)));
});

test('GitHub browser-exchange reuses the sealed encrypted token instead of re-encrypting an undefined plaintext', async () => {
  const server = await read('server/app.js');
  const start = server.indexOf("app.post('/api/auth/browser-exchange'");
  const block = server.slice(start, server.indexOf("app.post('/api/auth/native-exchange'"));
  assert.match(block, /session\.githubTokenEncrypted\|\|\(session\.githubToken\?encryptWorkspaceSecret\(session\.githubToken\):''\)/);
  assert.doesNotMatch(block, /githubTokenEncrypted:encryptWorkspaceSecret\(session\.githubToken\)/);
});

test('Creator chat Get credits button opens the real credit checkout and welcome actions are creation-focused', async () => {
  const app = await read('src/ui/App.jsx');
  const ui = await read('src/ui/WorkspaceSection.jsx');
  assert.match(app, /setCheckoutOpen,shareText/);
  assert.match(ui, /creator-plus-button" onClick=\{\(\)=>setCheckoutOpen\(true\)\}/);
  assert.match(ui, /Create an image/);
  assert.match(ui, /Write or edit/);
});
