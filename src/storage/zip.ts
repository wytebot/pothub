import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import { getProject, listMedia, putBundle, uid, type MediaKind, type MediaRecord, type ProjectRecord } from './db';

const FORMAT = 'ai-creative-studio-project';
interface Manifest {
  format: string; version: number;
  project: { name: string; createdAt: number; data: Record<string, unknown> };
  media: { id: string; kind: MediaKind; name: string; mime: string; createdAt: number; path: string }[];
}
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'project';

export async function exportProject(id: string): Promise<{ blob: Blob; fileName: string }> {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found. It may have been deleted.');
  const files: Zippable = {};
  const index: Manifest['media'] = [];
  for (const m of await listMedia(id)) {
    const path = `media/${m.id}`;
    files[path] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }]; // media is already compressed
    index.push({ id: m.id, kind: m.kind, name: m.name, mime: m.mime, createdAt: m.createdAt, path });
  }
  const manifest: Manifest = { format: FORMAT, version: 1, project: { name: p.name, createdAt: p.createdAt, data: p.data }, media: index };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return { blob: new Blob([zipSync(files) as unknown as BlobPart], { type: 'application/zip' }), fileName: `${safeName(p.name)}.studio.zip` };
}

export async function importProject(file: Blob): Promise<{ project: ProjectRecord; warnings: string[] }> {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(new Uint8Array(await file.arrayBuffer())); }
  catch { throw new Error('This file is not a valid project ZIP.'); }
  let m: Manifest;
  try { m = JSON.parse(strFromU8(entries['manifest.json'])) as Manifest; }
  catch { throw new Error('This ZIP has no readable project manifest.'); }
  if (m.format !== FORMAT) throw new Error('This ZIP was not exported from Pothub.');
  if (m.version > 1) throw new Error('This project came from a newer version of the app. Update the app and try again.');

  const now = Date.now();
  const project: ProjectRecord = { id: uid(), name: m.project.name, createdAt: m.project.createdAt ?? now, updatedAt: now, data: {} };
  let data = JSON.stringify(m.project.data ?? {});
  const warnings: string[] = [];
  const media: MediaRecord[] = [];
  for (const e of m.media ?? []) {
    const bytes = entries[e.path];
    if (!bytes) { warnings.push(`"${e.name}" was missing from the ZIP and was skipped.`); continue; }
    const id = uid();
    data = data.split(e.id).join(id);
    media.push({ id, projectId: project.id, kind: e.kind, name: e.name, mime: e.mime, size: bytes.length, createdAt: e.createdAt, blob: new Blob([bytes as unknown as BlobPart], { type: e.mime }) });
  }
  project.data = JSON.parse(data);
  await putBundle(project, media);
  return { project, warnings };
}
