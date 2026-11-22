import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Older Git commits may still contain this obsolete Google Drive sync module.
// Remove it before TypeScript scans src; local backup/restore lives elsewhere.
const obsolete = new URL('../src/cloud/sync.ts', import.meta.url);
if (existsSync(obsolete)) {
  await rm(obsolete, { force: true });
  console.log('Removed obsolete src/cloud/sync.ts (local backup/restore is retained).');
}
