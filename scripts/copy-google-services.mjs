// Copies google-services.json into the generated Android project so native Google sign-in works.
// Run automatically by `npm run android:sync`. Safe to run again.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
const from = 'google-services.json', toDir = 'android/app', to = `${toDir}/google-services.json`;
if (!existsSync(from)) { console.error(`Missing ${from} (download it from Firebase console > Project settings > Your apps > Android).`); process.exit(1); }
if (!existsSync('android')) { console.error('No android/ folder yet. Run `npx cap add android` first, then `npm run android:sync`.'); process.exit(1); }
mkdirSync(toDir, { recursive: true }); copyFileSync(from, to); console.log(`Copied ${from} -> ${to}`);
