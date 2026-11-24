import { auth } from '../firebase';
import { announceChats } from '../chat/state';
import { allChats, clearLocalData, deleteChat, deleteMedia, deleteProject, getMedia, getMeta, listProjects, mediaIndex, putBundle, putChat, putMedia, setMeta, type ChatRecord, type ProjectRecord } from '../storage/db';
import { DriveError, download, listAll, remove, upload, type DriveFile } from './drive';
import { cachedToken, clearToken, connectDrive, getToken, TOKEN_EVENT } from './token';

/**
 * Keeps chats, projects and generated media in step with a private folder in the person's own Google Drive,
 * so everything is there when they sign in on another device. Nothing is stored on Pothub's servers.
 * Provider keys are never synced.
 */
export type CloudStatus = 'off' | 'idle' | 'syncing' | 'needs-connect' | 'no-permission' | 'other-account' | 'full' | 'error';
export const CLOUD_CHANGED = 'cloud:changed';
const ENABLED = 'cloud.enabled'; const MEDIA = 'cloud.media'; const LAST = 'cloud.last'; const DIRTY = 'cloud.dirty'; const MANIFEST = 'cloud.manifest.v1';
const MAX_MEDIA_BYTES = 100 * 1_048_576;

interface Manifest { uid: string; names: string[]; }
interface State { status: CloudStatus; message: string; detail: string; }
let state: State = { status: 'idle', message: '', detail: '' };
const set = (status: CloudStatus, message = '', detail = '') => { state = { status, message, detail }; window.dispatchEvent(new Event(CLOUD_CHANGED)); };

export const cloudState = (): State => state;
export const cloudEnabled = () => localStorage.getItem(ENABLED) !== '0';
export const mediaSyncEnabled = () => false;
export const lastCloudSync = () => Number(localStorage.getItem(LAST) ?? 0);
export const cloudDirty = () => localStorage.getItem(DIRTY) === '1';
export function setCloudEnabled(on: boolean) { try { localStorage.setItem(ENABLED, on ? '1' : '0'); } catch { /* storage blocked */ } set(on ? 'idle' : 'off'); }
export function setMediaSync(on: boolean) { try { localStorage.setItem(MEDIA, on ? '1' : '0'); } catch { /* storage blocked */ } set(state.status, state.message, state.detail); }
const markDirty = (v: boolean) => { try { if (v) localStorage.setItem(DIRTY, '1'); else localStorage.removeItem(DIRTY); } catch { /* storage blocked */ } };

type Kind = 'chat' | 'project' | 'media';
const kindOf = (name: string): Kind | null => (name.startsWith('chat-') ? 'chat' : name.startsWith('project-') ? 'project' : name.startsWith('media-') ? 'media' : null);
const idOf = (name: string) => name.slice(name.indexOf('-') + 1);
interface Item { name: string; kind: Kind; updatedAt: number; }

const remoteStamp = (f: DriveFile) => { const u = Number(f.appProperties?.u); return Number.isFinite(u) && u > 0 ? u : Date.parse(f.modifiedTime) || 0; };
const json = (v: unknown) => new Blob([JSON.stringify(v)], { type: 'application/json' });
const cleanChat = (c: ChatRecord): ChatRecord => ({ ...c, messages: c.messages.map((m) => { const { fileOut: _f, ...rest } = m; void _f; return rest; }) });

class Pause extends Error { constructor(public why: 'other-account') { super(why); } }

let applying = false;
async function run(token: string, uid: string): Promise<{ failed: number; skipped: number }> {
  const withMedia = mediaSyncEnabled();
  const inScope = (n: string) => { const k = kindOf(n); return k === 'chat' || k === 'project' || (k === 'media' && withMedia); };
  const mf = (await getMeta<Manifest>(MANIFEST)) ?? { uid, names: [] };
  if (mf.uid && mf.uid !== uid) throw new Pause('other-account');

  set('syncing', '', 'Checking your Drive…');
  const remote = new Map((await listAll(token)).filter((f) => inScope(f.name)).map((f) => [f.name, f]));

  const local = new Map<string, Item>();
  for (const c of await allChats()) local.set(`chat-${c.id}`, { name: `chat-${c.id}`, kind: 'chat', updatedAt: c.updatedAt });
  const projects = new Map<string, ProjectRecord>(); for (const p of await listProjects()) { projects.set(`project-${p.id}`, p); local.set(`project-${p.id}`, { name: `project-${p.id}`, kind: 'project', updatedAt: p.updatedAt }); }
  if (withMedia) for (const m of await mediaIndex()) local.set(`media-${m.id}`, { name: `media-${m.id}`, kind: 'media', updatedAt: m.createdAt });

  // What was in step at the last sync. An item missing on one side that was in step before was deleted on that side.
  let known = new Set(mf.names.filter(inScope));
  if (remote.size === 0 && known.size > 0) known = new Set(); // the cloud copy was emptied: send everything again instead of deleting here
  const upl: { name: string; id?: string }[] = []; const dl: DriveFile[] = []; let delLocal: string[] = []; const delRemote: DriveFile[] = [];
  for (const [name, l] of local) {
    const r = remote.get(name);
    if (!r) { if (known.has(name)) delLocal.push(name); else upl.push({ name }); continue; }
    if (l.kind === 'media') continue;
    const ru = remoteStamp(r);
    if (l.updatedAt > ru) upl.push({ name, id: r.id }); else if (ru > l.updatedAt) dl.push(r);
  }
  for (const [name, r] of remote) { if (local.has(name)) continue; if (known.has(name)) delRemote.push(r); else dl.push(r); }
  // Safety: a sudden mass deletion from the cloud side is more likely a reset than a wish, so keep this device's copy and send it back up.
  if (delLocal.length > 25 && delLocal.length > local.size / 2) { delLocal.forEach((name) => upl.push({ name })); delLocal = []; }

  const inStep = new Set<string>([...local.keys()].filter((n) => remote.has(n)));
  let failed = 0; let skipped = 0; let step = 0; const total = upl.length + dl.length + delLocal.length + delRemote.length;
  const tick = (what: string) => set('syncing', '', `${what} (${++step} of ${total})`);
  const guard = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { if (e instanceof DriveError && e.kind !== 'other') throw e; failed++; } };

  applying = true;
  try {
    // text records first; legacy media sync is disabled
    const order = (a: string, b: string) => (kindOf(a) === 'media' ? 1 : 0) - (kindOf(b) === 'media' ? 1 : 0);
    for (const u of upl.sort((a, b) => order(a.name, b.name))) await guard(async () => {
      tick('Uploading'); const k = kindOf(u.name) as Kind; const id = idOf(u.name);
      if (k === 'chat') { const c = (await allChats()).find((x) => x.id === id); if (!c) return; await upload(token, { id: u.id, name: u.name, mime: 'application/json', blob: json(cleanChat(c)), appProperties: { k, u: String(c.updatedAt) } }); }
      else if (k === 'project') { const p = projects.get(u.name); if (!p) return; await upload(token, { id: u.id, name: u.name, mime: 'application/json', blob: json(p), appProperties: { k, u: String(p.updatedAt) } }); }
      else {
        const m = await getMedia(id); if (!m) return;
        if (m.blob.size > MAX_MEDIA_BYTES) { skipped++; return; }
        await upload(token, { name: u.name, mime: m.mime || 'application/octet-stream', blob: m.blob, appProperties: { k, u: String(m.createdAt) }, description: JSON.stringify({ name: m.name, mime: m.mime, kind: m.kind, projectId: m.projectId, createdAt: m.createdAt }) });
      }
      inStep.add(u.name);
    });

    for (const f of dl.sort((a, b) => order(a.name, b.name))) await guard(async () => {
      tick('Downloading'); const k = kindOf(f.name) as Kind; const id = idOf(f.name); const blob = await download(token, f.id);
      if (k === 'chat') { const c = JSON.parse(await blob.text()) as ChatRecord; if (c.id !== id || !Array.isArray(c.messages)) throw new Error('bad chat'); await putChat(c); }
      else if (k === 'project') { const p = JSON.parse(await blob.text()) as ProjectRecord; if (p.id !== id) throw new Error('bad project'); await putBundle(p, []); }
      else {
        const d = JSON.parse(f.description ?? '{}') as { name?: string; mime?: string; kind?: 'image' | 'video' | 'audio'; projectId?: string | null; createdAt?: number };
        const mime = d.mime || blob.type || 'application/octet-stream';
        await putMedia({ id, projectId: d.projectId ?? null, kind: d.kind ?? 'image', name: d.name ?? id, mime, size: blob.size, createdAt: d.createdAt ?? Date.now(), blob: new Blob([blob], { type: mime }) });
      }
      inStep.add(f.name);
    });

    for (const name of delLocal) await guard(async () => {
      tick('Updating'); const k = kindOf(name) as Kind; const id = idOf(name);
      if (k === 'chat') await deleteChat(id); else if (k === 'project') await deleteProject(id); else await deleteMedia(id);
      inStep.delete(name);
    });
    for (const f of delRemote) await guard(async () => { tick('Updating'); await remove(token, f.id); inStep.delete(f.name); });
  } finally { applying = false; }

  const keepOther = mf.names.filter((n) => !inScope(n));
  await setMeta(MANIFEST, { uid, names: [...inStep, ...keepOther] } satisfies Manifest);
  if (dl.some((f) => kindOf(f.name) === 'chat') || delLocal.some((n) => kindOf(n) === 'chat')) announceChats();
  return { failed, skipped };
}

async function doSync(interactive: boolean): Promise<void> {
  const u = auth.currentUser;
  if (!u) { set('off', 'Sign in to sync your work.'); return; }
  if (!cloudEnabled()) { set('off'); return; }
  const email = u.email ?? '';
  let token = await getToken(email);
  if (!token && interactive) {
    const c = await connectDrive(email);
    if (c === 'redirect') return;
    if (c === 'wrong-account') { set('needs-connect', `That is a different Google account. Choose ${email}.`); return; }
    if (c === 'no-scope') { set('no-permission', 'Google Drive access was not granted. Tick the Drive box on Google’s screen.'); return; }
    if (c !== 'ok') { set('needs-connect', 'Google Drive was not connected.'); return; }
    token = cachedToken();
  }
  if (!token) { set('needs-connect', 'Reconnect Google Drive to keep your work in sync.'); return; }
  set('syncing', '', 'Starting…');
  try {
    const r = await run(token, u.uid);
    try { localStorage.setItem(LAST, String(Date.now())); } catch { /* storage blocked */ }
    markDirty(false);
    if (r.failed) set('error', `${r.failed} item${r.failed > 1 ? 's' : ''} could not sync and will be tried again.`);
    else if (r.skipped) set('idle', `${r.skipped} large file${r.skipped > 1 ? 's were' : ' was'} kept on this device only (over 100 MB).`);
    else set('idle');
  } catch (e) {
    if (e instanceof Pause) { set('other-account', 'This device holds another account’s data.'); return; }
    if (e instanceof DriveError) {
      if (e.kind === 'token') { clearToken(); set('needs-connect', 'Reconnect Google Drive to keep your work in sync.'); }
      else if (e.kind === 'permission') set('no-permission', 'Google Drive access was not granted.');
      else if (e.kind === 'full') set('full', 'Your Google Drive is full, so Pothub could not save more. Free some space and sync again.');
      else set('error', e.message);
      return;
    }
    set('error', 'Sync stopped unexpectedly and will be tried again.');
  }
}

let running: Promise<void> | null = null;
/** One sync at a time. `interactive` means the person tapped a button, so asking Google for access is allowed. */
export function syncNow(interactive = false): Promise<void> {
  if (running) return running;
  const p = doSync(interactive).finally(() => { if (running === p) running = null; });
  running = p; return p;
}

/** The device holds another account's data: merge it into this account, or replace it with this account's. */
export async function resolveOtherAccount(how: 'merge' | 'replace') {
  const uid = auth.currentUser?.uid; if (!uid) return;
  if (how === 'replace') await clearLocalData();
  await setMeta(MANIFEST, { uid, names: [] } satisfies Manifest);
  announceChats(); await syncNow(true);
}

/** Deletes everything Pothub keeps in the person's Drive and turns sync off. Nothing on this device is touched. */
export async function deleteCloudCopy(): Promise<void> {
  const u = auth.currentUser; if (!u) return;
  let token = await getToken(u.email ?? '');
  if (!token) { const c = await connectDrive(u.email ?? ''); if (c === 'redirect') return; token = c === 'ok' ? cachedToken() : null; }
  if (!token) { set('needs-connect', 'Reconnect Google Drive first, then delete the cloud copy.'); return; }
  try { for (const f of await listAll(token)) await remove(token, f.id); await setMeta(MANIFEST, { uid: u.uid, names: [] } satisfies Manifest); setCloudEnabled(false); set('off', 'Your cloud copy was deleted. Sync is off.'); }
  catch (e) { set('error', e instanceof DriveError ? e.message : 'Could not delete the cloud copy. Try again.'); }
}

/** Runs sync in the background: at sign-in, after changes, when the app returns to the front, and when the connection comes back. */
export function startCloudSync() {
  let timer = 0;
  const later = (ms: number) => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (cloudEnabled() && auth.currentUser) void syncNow(false); }, ms); };
  window.addEventListener('data:changed', () => { if (applying) return; markDirty(true); later(8_000); });
  window.addEventListener(TOKEN_EVENT, () => later(300));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') later(1_200); });
  window.addEventListener('online', () => later(1_500));
  window.setInterval(() => { if (document.visibilityState === 'visible') later(0); }, 5 * 60_000);
  auth.onAuthStateChanged((u) => { if (u) later(1_500); else set('off'); });
}
