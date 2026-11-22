import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { allChats, getMedia, listProjects, listLibrary, listMedia, putChat, putBundle, putMedia, type ChatRecord, type MediaRecord, type ProjectRecord } from './db';

const FORMAT = 'pothub-full-backup';
const VERSION = 1;
interface BackupManifest { format: string; version: number; createdAt: number; chats: ChatRecord[]; projects: ProjectRecord[]; media: Omit<MediaRecord, 'blob'>[]; }

/** Full local backup: conversation history, editor projects, project media and generated-media library. */
export async function createBackup(): Promise<{ blob: Blob; name: string; counts: { chats: number; projects: number; media: number } }> {
  const chats = await allChats();
  const projects = await listProjects();
  const media: MediaRecord[] = [];
  for (const p of projects) media.push(...await listMedia(p.id));
  media.push(...await listLibrary());
  const files: Zippable = {};
  const index: BackupManifest['media'] = [];
  for (let i = 0; i < media.length; i++) {
    const m = media[i]; const path = `media/${m.id}`;
    files[path] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }];
    const { blob: _blob, ...meta } = m; void _blob; index.push(meta);
  }
  const manifest: BackupManifest = { format: FORMAT, version: VERSION, createdAt: Date.now(), chats, projects, media: index };
  files['backup.json'] = strToU8(JSON.stringify(manifest));
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  return { blob: new Blob([zipSync(files) as unknown as BlobPart], { type: 'application/zip' }), name: `pothub-backup-${date}.zip`, counts: { chats: chats.length, projects: projects.length, media: media.length } };
}

/** Merge restore: never clears local stores. Newer timestamps win per matching record; unrelated local records remain. */
export async function restoreBackup(file: Blob): Promise<{ chatsAdded: number; chatsUpdated: number; projectsAdded: number; projectsUpdated: number; mediaAdded: number; mediaUpdated: number; skipped: number }> {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { throw new Error('This is not a valid Pothub backup ZIP.'); }
  let m: BackupManifest;
  try { m = JSON.parse(strFromU8(entries['backup.json'])) as BackupManifest; } catch { throw new Error('The backup manifest is missing or damaged.'); }
  if (m.format !== FORMAT || !Array.isArray(m.chats) || !Array.isArray(m.projects) || !Array.isArray(m.media)) throw new Error('This ZIP is not a supported full Pothub backup.');
  if (m.version > VERSION) throw new Error('This backup was created by a newer Pothub version. Update the app before restoring it.');
  const currentChats = new Map<string, ChatRecord>((await allChats()).map((x): [string, ChatRecord] => [x.id, x]));
  const currentProjects = new Map<string, ProjectRecord>((await listProjects()).map((x): [string, ProjectRecord] => [x.id, x]));
  let chatsAdded = 0, chatsUpdated = 0, projectsAdded = 0, projectsUpdated = 0, mediaAdded = 0, mediaUpdated = 0, skipped = 0;
  for (const c of m.chats) {
    const old = currentChats.get(c.id);
    if (!old) { await putChat(c); chatsAdded++; }
    else if ((c.updatedAt || 0) > (old.updatedAt || 0)) { await putChat(c); chatsUpdated++; }
  }
  for (const p of m.projects) {
    const old = currentProjects.get(p.id);
    if (!old) { await putBundle(p, []); projectsAdded++; }
    else if ((p.updatedAt || 0) > (old.updatedAt || 0)) { await putBundle(p, []); projectsUpdated++; }
  }
  for (const e of m.media) {
    const bytes = entries[`media/${e.id}`];
    if (!bytes) { skipped++; continue; }
    const blob = new Blob([bytes as unknown as BlobPart], { type: e.mime || 'application/octet-stream' });
    const record: MediaRecord = { ...e, size: bytes.length, blob };
    const existing = await getMedia(e.id);
    if (!existing) { await putMedia(record); mediaAdded++; }
    else if ((e.createdAt || 0) > (existing.createdAt || 0)) { await putMedia(record); mediaUpdated++; }
  }
  return { chatsAdded, chatsUpdated, projectsAdded, projectsUpdated, mediaAdded, mediaUpdated, skipped };
}

