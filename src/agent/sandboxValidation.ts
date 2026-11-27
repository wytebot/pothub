import { zipSync, unzipSync, strToU8 } from 'fflate';
import { base64Of, type Attachment } from './attachments';
import { buildBundle, parseBundle } from './bundle';
import type { OutFile } from './deliver';

export interface SandboxCheck { name: string; status: 'pass' | 'fail' | 'skip'; detail?: string; }
export interface SandboxResult { engine: string[]; checks: SandboxCheck[]; durationMs: number; success: boolean; output?: string; }
export interface ProjectValidation { projectFile?: OutFile; report: string; result?: SandboxResult; patchedFiles: number; patchOnly: boolean; }
const MAX_ZIP_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 1500;
const MAX_UNPACKED = 30 * 1024 * 1024;
const secretPath = (p: string) => /(^|\/)(\.env(?:\.[^/]+)?|.*(?:service[-_]?account|credentials|secrets?)\.json|id_rsa|id_ed25519|.*\.pem|.*\.key)$/i.test(p);
const generatedPath = (p: string) => /(^|\/)(node_modules|vendor|\.git|\.dart_tool|\.gradle)(\/|$)/i.test(p);
const cleanPath = (raw: string) => {
  const p = raw.replace(/\\/g, '/');
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.split('/').some((x) => x === '..')) return '';
  const out = p.split('/').filter((x) => x && x !== '.').join('/');
  return out.length <= 240 && !/[\u0000-\u001f]/.test(out) ? out : '';
};
const toBase64 = async (blob: Blob) => base64Of(blob);
export function preflightZip(bytes: Uint8Array): string[] {
  const endMin = Math.max(0, bytes.length - 65_557); let eocd = -1;
  for (let i = bytes.length - 22; i >= endMin; i--) { if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; } }
  if (eocd < 0) throw new Error('The project archive is not a supported ZIP (ZIP64 archives are not accepted).');
  const count = bytes[eocd + 10] | (bytes[eocd + 11] << 8); const cdSize = (bytes[eocd + 12] | (bytes[eocd + 13] << 8) | (bytes[eocd + 14] << 16) | (bytes[eocd + 15] << 24)) >>> 0;
  let offset = (bytes[eocd + 16] | (bytes[eocd + 17] << 8) | (bytes[eocd + 18] << 16) | (bytes[eocd + 19] << 24)) >>> 0;
  if (count === 0 || count > MAX_FILES || offset + cdSize > eocd) throw new Error('The ZIP directory is invalid, empty, or contains too many files.');
  const names: string[] = []; let expanded = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b || bytes[offset + 2] !== 0x01 || bytes[offset + 3] !== 0x02) throw new Error('The ZIP directory contains an invalid file entry.');
    const flags = bytes[offset + 8] | (bytes[offset + 9] << 8); const method = bytes[offset + 10] | (bytes[offset + 11] << 8);
    const compressed = (bytes[offset + 20] | (bytes[offset + 21] << 8) | (bytes[offset + 22] << 16) | (bytes[offset + 23] << 24)) >>> 0;
    const uncompressed = (bytes[offset + 24] | (bytes[offset + 25] << 8) | (bytes[offset + 26] << 16) | (bytes[offset + 27] << 24)) >>> 0;
    const nameLen = bytes[offset + 28] | (bytes[offset + 29] << 8); const extraLen = bytes[offset + 30] | (bytes[offset + 31] << 8); const commentLen = bytes[offset + 32] | (bytes[offset + 33] << 8);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen)); const mode = (bytes[offset + 38] | (bytes[offset + 39] << 8) | (bytes[offset + 40] << 16) | (bytes[offset + 41] << 24)) >>> 0;
    if (flags & 1) throw new Error('Encrypted ZIP files cannot be sandboxed.'); if (![0, 8].includes(method)) throw new Error('The ZIP uses an unsupported compression method.');
    if (((mode >>> 16) & 0xf000) === 0xa000) throw new Error('ZIP symbolic links are not accepted in sandbox projects.');
    if (uncompressed > 5 * 1024 * 1024 || (uncompressed > 1_000_000 && uncompressed / Math.max(1, compressed) > 250)) throw new Error('A ZIP entry exceeds the safe expansion limit.');
    expanded += uncompressed; if (expanded > MAX_UNPACKED) throw new Error('The project expands beyond the sandbox workspace limit.');
    const path = cleanPath(name); if (!path && !name.endsWith('/')) throw new Error('The ZIP contains an unsafe file path.'); if (path && !generatedPath(path) && !secretPath(path)) names.push(path);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (offset > eocd) throw new Error('The ZIP central directory is malformed.');
  return names;
}

const reportText = (r: SandboxResult, patchedFiles: number) => {
  const passed = r.checks.filter((c) => c.status === 'pass').length;
  const failed = r.checks.filter((c) => c.status === 'fail').length;
  const skipped = r.checks.filter((c) => c.status === 'skip').length;
  return `### Isolated validation\n\n**Files merged:** ${patchedFiles}\n\n**Result:** ${failed ? 'Checks failed' : r.success ? 'Checks passed' : 'No checks executed'} · **${passed} passed**, **${failed} failed**, **${skipped} skipped** · ${(r.durationMs / 1000).toFixed(1)}s\n\n**Detected engines:** ${r.engine.join(', ') || 'Unknown'}\n\n${r.checks.map((c) => `- ${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '○'} **${c.name}**${c.detail ? ` — ${c.detail}` : ''}`).join('\n')}\n\n${skipped ? 'Skipped checks are not counted as passed. Missing project dependencies or unsupported engines may prevent complete verification.' : ''}`;
};

/** Merge the reviewed code file blocks into the uploaded ZIP without leaving the original project out. */
export async function validateProjectInSandbox(originals: Attachment[], reviewedText: string, log: { step: (s: string) => void }): Promise<ProjectValidation | null> {
  const archive = originals.find((f) => f.name.toLowerCase().endsWith('.zip') && f.kind === 'archive');
  if (!archive) return null;
  if (archive.size > MAX_ZIP_BYTES) {
    log.step('Project is larger than the sandbox upload limit; preparing a patch-only ZIP…');
    const patch = await buildBundle(reviewedText, 'pothub-project-patch');
    const count = parseBundle(reviewedText).length;
    return { projectFile: patch ? { blob: patch.blob, name: patch.name, mime: 'application/zip' } : undefined, patchedFiles: count, patchOnly: true, report: `### Isolated validation\n\n**Not run:** the source archive exceeds the 6 MB sandbox upload limit. A patch-only ZIP is attached when generated. No build or test is claimed to have run.` };
  }
  log.step('Preparing a sanitized project workspace and applying reviewed files…');
  let extracted: Record<string, Uint8Array>;
  try { const archiveBytes = new Uint8Array(await archive.blob.arrayBuffer()); preflightZip(archiveBytes); extracted = unzipSync(archiveBytes); } catch (e) { throw new Error(e instanceof Error ? e.message : `I could not safely open ${archive.name} as a ZIP project.`); }
  let entries: Record<string, Uint8Array> = {};
  let size = 0;
  for (const [raw, data] of Object.entries(extracted)) {
    const p = cleanPath(raw); if (!p || raw.endsWith('/') || secretPath(p) || generatedPath(p)) continue;
    if (data.byteLength > 5 * 1024 * 1024 || Object.keys(entries).length >= MAX_FILES) throw new Error('The project is too large to prepare safely for sandbox validation.');
    size += data.byteLength; if (size > MAX_UNPACKED) throw new Error('The project expands beyond the sandbox workspace limit.');
    entries[p] = data;
  }
  // Normalize a wrapper directory only when it contains a recognizable project manifest.
  const paths = Object.keys(entries); const first = paths[0]?.split('/')[0]; let rootPrefix = '';
  const manifestNames = ['package.json', 'pubspec.yaml', 'pom.xml', 'go.mod', 'Cargo.toml', 'composer.json', 'pyproject.toml', 'requirements.txt'];
  const wrapperManifest = first && manifestNames.some((m) => entries[`${first}/${m}`] !== undefined);
  if (first && wrapperManifest && paths.length > 1 && paths.every((p) => p.startsWith(`${first}/`))) {
    const normalized: Record<string, Uint8Array> = {}; for (const p of paths) normalized[p.slice(first.length + 1)] = entries[p]; entries = normalized; rootPrefix = `${first}/`;
  }
  const patches = parseBundle(reviewedText);
  for (const f of patches) {
    const rawPatchPath = cleanPath(f.path); const p = rootPrefix && rawPatchPath.startsWith(rootPrefix) ? rawPatchPath.slice(rootPrefix.length) : rawPatchPath; if (!p || secretPath(p) || generatedPath(p)) continue;
    const bytes = strToU8(f.content); if (bytes.byteLength > 5 * 1024 * 1024) throw new Error(`The generated file ${p} exceeds the sandbox per-file limit.`);
    size += bytes.byteLength; if (size > MAX_UNPACKED) throw new Error('The project plus generated changes exceeds the sandbox workspace limit.');
    entries[p] = bytes;
  }
  const notesPath = entries['POTHUB-SANDBOX-NOTES.md'] ? 'POTHUB-SANDBOX-NOTES-2.md' : 'POTHUB-SANDBOX-NOTES.md'; entries[notesPath] = strToU8('This project archive is a sanitized engineering workspace. Secret-like files (.env, credentials, private keys) and generated dependency/build folders (node_modules, vendor, .git, .dart_tool, .gradle) were excluded. Restore dependencies using the project package manager before local use. Sandbox checks run with network disabled after dependency installation.\n');
  const projectBlob = new Blob([zipSync(entries, { level: 4 }) as unknown as BlobPart], { type: 'application/zip' });
  if (projectBlob.size > MAX_ZIP_BYTES) throw new Error('The merged project archive exceeds the sandbox 6 MB limit.');
  const projectFile: OutFile = { blob: projectBlob, name: 'pothub-updated-project.zip', mime: 'application/zip' };
  const patchedFiles = patches.filter((f) => { const p = cleanPath(f.path); return !!p && !secretPath(p) && !generatedPath(p); }).length;
  log.step('Running project checks inside the isolated sandbox…');
  let result: SandboxResult | undefined; let report: string;
  try { const { request } = await import('../security/api'); result = await request<SandboxResult>('/api/engineering/validate', { archive: await toBase64(projectBlob) }, 260_000); report = reportText(result, patchedFiles); }
  catch (e) { report = `### Isolated validation\n\n**Not run:** the sandbox runner could not be reached or did not accept the project.\n\n${e instanceof Error ? e.message : 'Unknown runner error'}\n\nThe merged project ZIP is still attached for review. No build or test is claimed to have run.`; }
  return { projectFile, result, report, patchedFiles, patchOnly: false };
}
