// Copies android-res/* (notification icon) into the generated Android project. Run by `npm run android:sync`. Safe to run again.
import { cpSync, existsSync } from 'node:fs';
const from = 'android-res', to = 'android/app/src/main/res';
if (!existsSync(from)) { console.error(`Missing ${from}/`); process.exit(1); }
if (!existsSync('android')) { console.error('No android/ folder yet. Run `npx cap add android` first, then `npm run android:sync`.'); process.exit(1); }
cpSync(from, to, { recursive: true }); console.log(`Copied ${from} -> ${to}`);
