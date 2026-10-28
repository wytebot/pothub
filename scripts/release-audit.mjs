import fs from 'node:fs';
import path from 'node:path';
import { PACKS, OPERATIONS, BYO_SERVICE_FEES } from '../server/pricing.js';
const root = process.cwd();
const requiredFiles = [
  'package.json','index.html','public/manifest.webmanifest','public/sw.js','server/app.js',
  'server/lib.js','server/billing-safety.js','server/ai-safety.js','server/pricing.js','firestore.rules','firestore.indexes.json','firebase.json',
  'scripts/migrate-supabase-to-firestore.mjs','src/ui/App.jsx','src/lib/db.js',
  'public/icons/pothub-192.png','public/icons/pothub-512.png','README.md','FINDINGS_LEDGER.md'
];
const failures=[];
for(const f of requiredFiles) if(!fs.existsSync(path.join(root,f))) failures.push(`Missing required file: ${f}`);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const rules=read('firestore.rules'), indexes=JSON.parse(read('firestore.indexes.json'));
const app=read('server/app.js'), lib=read('server/lib.js'), ui=read('src/ui/App.jsx'), main=read('src/main.jsx');
if(pkg.dependencies?.['@supabase/supabase-js']) failures.push('Unused Supabase SDK dependency remains.');
if(!pkg.dependencies?.firebase || !fs.existsSync(path.join(root,'src/lib/firebase.js')) || !ui.includes('../lib/firebase.js')) failures.push('Firebase browser authentication module is missing or not wired into the UI.');
if(!Array.isArray(PACKS)||PACKS.length!==4||!PACKS.every(p=>Number.isFinite(p.usd)&&Number.isInteger(p.credits))) failures.push('Pricing module does not expose four valid credit packs.');
if(JSON.stringify(OPERATIONS)!==JSON.stringify({diagnosis:10,repair:20,file:15})) failures.push('Public operation prices changed unexpectedly.');
if(JSON.stringify(BYO_SERVICE_FEES)!==JSON.stringify({developer:2,creator:1})) failures.push('BYO service fees changed unexpectedly.');
if(!app.includes("app.get('/api/pricing'")||!ui.includes("api('/api/pricing')")) failures.push('Pricing UI/API are not connected to the server source of truth.');
if(!app.includes("app.get('/api/health'")||!app.includes("app.get('/api/billing/checkout'")&&!app.includes("app.post('/api/billing/checkout'")) failures.push('Health or checkout route missing.');
if(app.includes("/api/creator/video") || ui.includes('Videos')) failures.push('Unsupported video-generation capability is still exposed.');
if(!app.includes('isVerifiedPayment(o,d)') || !app.includes('isValidWebhookSecret(expected,provided)')) failures.push('Payment verification or webhook signature guard is not wired.');
if(!lib.includes('grantDocumentId(id,reference)')) failures.push('Credit grants are not using deterministic idempotency markers.');
if(!lib.includes('return getApps()[0]')) failures.push('Firebase Admin app initialization regression detected.');
if(!rules.includes('allow read, write: if false')) failures.push('Firestore rules do not deny direct client access.');
if(!indexes.indexes || !Array.isArray(indexes.indexes)) failures.push('Firestore indexes file is malformed.');
if(manifest.name!=='Pothub' && !String(manifest.name||'').startsWith('Pothub')) failures.push('PWA manifest name is not Pothub.');

if(/GEMINI_API_KEY|FLW_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY|VERCEL_CLIENT_SECRET/.test(ui)) failures.push('Server-only secret variable referenced by the main UI source.');
if(!pkg.scripts?.build||!pkg.scripts?.test||!pkg.scripts?.check) failures.push('Build/test/check scripts missing.');
if(failures.length){console.error('Release source audit failed:');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
const biometricUi = ui;
if (!biometricUi.includes('pothub_secret_mode') || !biometricUi.includes('NativeBiometric.verifyIdentity') || !biometricUi.includes('navigator.credentials.get')) throw new Error('Optional browser/native biometric Secret mode is not wired.');
if (!pkg.dependencies?.['@capgo/capacitor-native-biometric']) throw new Error('Native biometric plugin dependency is missing.');
const apiClient = read('src/lib/api.js');
if (apiClient.includes("sessionStorageSafe('pothub_agent_config')") || apiClient.includes("sessionStorage.setItem('pothub_agent_config'")) throw new Error('Provider keys must not be persisted to Web Storage.');
if (!apiClient.includes('Secret mode is locked') || !apiClient.includes('configureRuntimeAgent') || !ui.includes("document.visibilityState==='hidden'")) throw new Error('Runtime biometric lock / background relock is not enforced.');
console.log('Release source audit passed: package and manifest JSON parsed; required files exist; prices match the pricing module; pricing endpoint is wired; Firebase Admin init and deny-all rules checked; Firebase browser authentication wired; no known server-secret variable names in main UI.');
console.log('Scope: this is a static source audit. It does not validate live Firebase credentials, Firestore indexes against production queries, provider payments, browser E2E, Android devices, or deployment state.');
