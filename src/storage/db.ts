export type MediaKind = 'image' | 'video' | 'audio';
export interface ProjectRecord { id: string; name: string; createdAt: number; updatedAt: number; data: Record<string, unknown>; }
export interface MediaRecord { id: string; projectId: string | null; kind: MediaKind; name: string; mime: string; size: number; createdAt: number; blob: Blob; }

const DB_NAME = 'creative-studio';
let dbp: Promise<IDBDatabase> | null = null;

export const uid = () => crypto.randomUUID();

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('media', { keyPath: 'id' }).createIndex('projectId', 'projectId');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error); };
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
    await finished;
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
  try { const t = (await open()).transaction('media', 'readwrite'); const f = done(t); t.objectStore('media').put(m); await f; } catch (e) { throw friendly(e); }
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
  await finished;
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
  const t = (await open()).transaction('media', 'readwrite'); const f = done(t); t.objectStore('media').delete(id); await f;
}
