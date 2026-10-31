import { mkdtemp, cp, mkdir, readFile, writeFile, rm, symlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'pothub-cap-'));
const excluded = new Set(['api', '.next', 'node_modules']);
try {
  await mkdir(path.join(temp, 'pages'), { recursive: true });
  for (const name of ['src','public','components','styles']) {
    try { await cp(path.join(root,name),path.join(temp,name),{recursive:true,filter:src=>!src.split(path.sep).some(part=>excluded.has(part))}); } catch (e) { if(e.code!=='ENOENT') throw e; }
  }
  for (const name of ['pages/index.jsx','pages/_app.jsx']) await cp(path.join(root,name),path.join(temp,name));
  for (const name of ['package.json','capacitor.config.json']) await cp(path.join(root,name),path.join(temp,name));
  await writeFile(path.join(temp,'next.config.mjs'),`export default { output:'export', trailingSlash:false, images:{unoptimized:true}, poweredByHeader:false, reactStrictMode:true };\n`);
  await symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
  const worker=path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  await access(worker,constants.R_OK);
  await cp(worker,path.join(temp,'public/pdf.worker.mjs'));
  const stamp=await readFile(path.join(root,'public/sw.js'),'utf8');
  await writeFile(path.join(temp,'public/sw.js'),stamp);
  const nextBin=path.join(root,'node_modules/next/dist/bin/next');
  const build=spawnSync(process.execPath,[nextBin,'build'],{cwd:temp,stdio:'inherit',env:process.env});
  if(build.status!==0)process.exitCode=build.status??1;
  else {
    const out=path.join(temp,'out');
    await rm(path.join(root,'out'),{recursive:true,force:true});
    await cp(out,path.join(root,'out'),{recursive:true});
    console.log('Capacitor static frontend exported to out/. Source API routes and tracked files were not modified.');
  }
} catch(error) {
  console.error(`[Capacitor build] ${error.message}`);process.exitCode=1;
} finally { await rm(temp,{recursive:true,force:true}); }
