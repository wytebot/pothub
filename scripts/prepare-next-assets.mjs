import { copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
const target = path.join(root, 'public/pdf.worker.mjs');
try { await access(source, constants.R_OK); }
catch { console.error('PDF.js worker is missing. Run npm install before building Pothub.'); process.exit(1); }
await copyFile(source, target);
console.log('Prepared the PDF.js worker for the Next.js build.');
