import type { ChatMessage } from '../chat/types';
export type MediaKind = 'image' | 'video' | 'audio';
export interface ProjectRecord { id: string; name: string; createdAt: number; updatedAt: number; data: Record<string, unknown>; }
export interface MediaRecord { id: string; projectId: string | null; kind: MediaKind; name: string; mime: string; size: number; createdAt: number; blob: Blob; }

/** One saved conversation. */
export interface ChatRecord { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[]; }

/** Announces a local data change to interested UI components. */
const touch = () => { try { window.dispatchEvent(new Event('data:changed')); } catch { /* not in a browser */ } };

const DB_NAME = 'creative-studio';
const DB_VERSION = 3;
let dbp: Promise<IDBDatabase> | null = null;

export const uid = () => crypto.randomUUID();

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      // Runs for brand-new installs (0 -> 2) and for people upgrading from the first version (1 -> 2). Existing data is never touched.
      const d = r.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' }).createIndex('projectId', 'projectId');
      if (!d.objectStoreNames.contains('chats')) d.createObjectStore('chats', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      if (!d.objectStoreNames.contains('artifacts')) d.createObjectStore('artifacts', { keyPath: 'id' });
    };
    r.onsuccess = () => {
      const d = r.result;
      // If a newer version of the app opens in another tab, let go so its upgrade is never blocked.
      d.onversionchange = () => { d.close(); dbp = null; };
      resolve(d);
    };
    r.onerror = () => { dbp = null; reject(r.error); };
    r.onblocked = () => { /* an old tab still has the database open; it closes itself through onversionchange */ };
  }));
}
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

function friendly(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return new Error('Device storage is full. Export or delete projects to free space, then try again.');
  return e instanceof Error ? e : new Error('Local storage failed.');
}

/** Writes a project and its media in ONE transaction: all saved or none saved. */
export async function putBundle(project: ProjectRecord, media: MediaRecord[]): Promise<void> {
  try {
    const t = (await open()).transaction(['projects', 'media'], 'readwrite');
    const finished = done(t);
    t.objectStore('projects').put(project);
    for (const m of media) t.objectStore('media').put(m);
    await finished; touch();
  } catch (e) { throw friendly(e); }
}

export async function createProject(name = 'Untitled project'): Promise<ProjectRecord> {
  const now = Date.now();
  const p: ProjectRecord = { id: uid(), name, createdAt: now, updatedAt: now, data: {} };
  await putBundle(p, []);
  return p;
}
export async function listProjects(): Promise<ProjectRecord[]> {
  const all = await req((await open()).transaction('projects').objectStore('projects').getAll());
  return (all as ProjectRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  return req((await open()).transaction('projects').objectStore('projects').get(id));
}
export async function renameProject(id: string, name: string): Promise<void> {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found. It may have been deleted.');
  await putBundle({ ...p, name, updatedAt: Date.now() }, []);
}
export async function listMedia(projectId: string): Promise<MediaRecord[]> {
  return req((await open()).transaction('media').objectStore('media').index('projectId').getAll(projectId));
}
export async function putMedia(m: MediaRecord): Promise<void> {
  try { const t = (await open()).transaction('media', 'readwrite'); const f = done(t); t.objectStore('media').put(m); await f; touch(); } catch (e) { throw friendly(e); }
}
export async function mediaCount(): Promise<number> {
  return req((await open()).transaction('media').objectStore('media').count());
}
export async function deleteProject(id: string): Promise<void> {
  const t = (await open()).transaction(['projects', 'media'], 'readwrite');
  const finished = done(t);
  const keys = await req(t.objectStore('media').index('projectId').getAllKeys(id));
  for (const k of keys) t.objectStore('media').delete(k);
  t.objectStore('projects').delete(id);
  await finished; touch();
}
export async function duplicateProject(id: string): Promise<ProjectRecord> {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found. It may have been deleted.');
  const now = Date.now();
  const copy: ProjectRecord = { ...p, id: uid(), name: `${p.name} copy`, createdAt: now, updatedAt: now };
  let data = JSON.stringify(p.data);
  const media = (await listMedia(id)).map((m) => { const nid = uid(); data = data.split(m.id).join(nid); return { ...m, id: nid, projectId: copy.id }; });
  copy.data = JSON.parse(data);
  await putBundle(copy, media);
  return copy;
}

/** Generated media not attached to a project (the Image/Video Studio library). */
export async function listLibrary(): Promise<MediaRecord[]> {
  const all = await req((await open()).transaction('media').objectStore('media').getAll());
  return (all as MediaRecord[]).filter((m) => m.projectId === null).sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteMedia(id: string): Promise<void> {
  const t = (await open()).transaction('media', 'readwrite'); const f = done(t); t.objectStore('media').delete(id); await f; touch();
}

// ---------------------------------------------------------------- chat history (IndexedDB, no size cap)
export async function putChat(c: ChatRecord): Promise<void> {
  try { const t = (await open()).transaction('chats', 'readwrite'); const f = done(t); t.objectStore('chats').put(c); await f; touch(); } catch (e) { throw friendly(e); }
}
export async function getChat(id: string): Promise<ChatRecord | undefined> {
  return req((await open()).transaction('chats').objectStore('chats').get(id));
}
/** Every saved conversation. */
export async function allChats(): Promise<ChatRecord[]> {
  return (await req((await open()).transaction('chats').objectStore('chats').getAll())) as ChatRecord[];
}
/** Visible conversations, newest first. */
export async function listChats(): Promise<ChatRecord[]> {
  return (await allChats()).sort((a, b) => b.updatedAt - a.updatedAt);
}
/** Removes a conversation from this device. */
export async function deleteChat(id: string): Promise<void> {
  const t = (await open()).transaction('chats', 'readwrite'); const f = done(t); t.objectStore('chats').delete(id); await f; touch();
}
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return req((await open()).transaction('meta').objectStore('meta').get(key)) as Promise<T | undefined>;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  const t = (await open()).transaction('meta', 'readwrite'); const f = done(t); t.objectStore('meta').put(value, key); await f;
}
export async function delMeta(key: string): Promise<void> {
  const t = (await open()).transaction('meta', 'readwrite'); const f = done(t); t.objectStore('meta').delete(key); await f;
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  return req((await open()).transaction('media').objectStore('media').get(id));
}
/** Empties chats, projects and media on this device (never the sync bookkeeping). */
export async function clearLocalData(): Promise<void> {
  const t = (await open()).transaction(['projects', 'media', 'chats'], 'readwrite'); const f = done(t);
  for (const n of ['projects', 'media', 'chats']) t.objectStore(n).clear();
  await f;
}

/** Persist generated downloadable files locally so a previous chat can recover its artifact. */
export interface ArtifactRecord { id: string; name: string; mime: string; blob: Blob; createdAt: number; }
export async function putArtifact(id: string, file: { name: string; mime: string; blob: Blob }): Promise<void> {
  const t = (await open()).transaction('artifacts', 'readwrite'); const f = done(t); t.objectStore('artifacts').put({ id, ...file, createdAt: Date.now() } satisfies ArtifactRecord); await f;
}
export async function getArtifact(id: string): Promise<ArtifactRecord | undefined> {
  return req((await open()).transaction('artifacts').objectStore('artifacts').get(id));
}
export async function deleteArtifact(id: string): Promise<void> {
  const t = (await open()).transaction('artifacts', 'readwrite'); const f = done(t); t.objectStore('artifacts').delete(id); await f;
}


/** Remove temporary generated artifacts older than 30 days; conversation history is intentionally retained. */
export async function pruneExpiredArtifacts(now = Date.now(), maxRecords = 100): Promise<number> {
  const all = (await req((await open()).transaction('artifacts').objectStore('artifacts').getAll())) as ArtifactRecord[];
  const ordered = all.sort((a, b) => b.createdAt - a.createdAt);
  const remove = ordered.filter((a, i) => now - a.createdAt > 30 * 24 * 60 * 60 * 1000 || i >= maxRecords);
  if (!remove.length) return 0;
  const t = (await open()).transaction('artifacts', 'readwrite'); const f = done(t); for (const a of remove) t.objectStore('artifacts').delete(a.id); await f; touch(); return remove.length;
}
