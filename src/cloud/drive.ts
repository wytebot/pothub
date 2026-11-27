/** Small client for the hidden MonyGist folder in the person's own Google Drive (the "appDataFolder" space). */
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DriveError extends Error {
  constructor(public kind: 'token' | 'permission' | 'full' | 'network' | 'other', message: string) { super(message); }
}
export interface DriveFile { id: string; name: string; modifiedTime: string; appProperties?: Record<string, string>; description?: string; }

async function call(token: string, url: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  for (let i = 0; ; i++) {
    let r: Response;
    try { r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } }); }
    catch { if (i < tries - 1) { await sleep(800 * (i + 1)); continue; } throw new DriveError('network', 'Could not reach Google Drive. Check your connection.'); }
    if (r.ok) return r;
    if (r.status === 401) throw new DriveError('token', 'Google Drive access expired.');
    if (r.status === 404 && init.method === 'DELETE') return r;
    const body = await r.text().catch(() => '');
    if (r.status === 403) {
      if (/rateLimitExceeded|userRateLimitExceeded/i.test(body) && i < tries - 1) { await sleep(1500 * (i + 1)); continue; }
      if (/storageQuotaExceeded/i.test(body)) throw new DriveError('full', 'Your Google Drive is full.');
      throw new DriveError('permission', 'MonyGist was not allowed to use your Google Drive app folder.');
    }
    if ((r.status === 429 || r.status >= 500) && i < tries - 1) { await sleep(1200 * (i + 1)); continue; }
    throw new DriveError('other', `Google Drive returned an error (${r.status}).`);
  }
}

/** Every file in the app folder, following all pages. */
export async function listAll(token: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []; let page = '';
  do {
    const q = `spaces=appDataFolder&pageSize=1000&fields=${encodeURIComponent('nextPageToken,files(id,name,modifiedTime,appProperties,description)')}${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
    const j = await (await call(token, `${API}/files?${q}`)).json() as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(j.files ?? [])); page = j.nextPageToken ?? '';
  } while (page);
  return out;
}

export async function download(token: string, id: string): Promise<Blob> {
  return (await call(token, `${API}/files/${encodeURIComponent(id)}?alt=media`)).blob();
}

export interface UploadSpec { id?: string; name: string; mime: string; blob: Blob; appProperties: Record<string, string>; description?: string; }
const MULTIPART_MAX = 4 * 1024 * 1024;
/** Creates the file, or replaces it when `id` is given. Big files use Google's resumable upload. */
export async function upload(token: string, u: UploadSpec): Promise<string> {
  const meta: Record<string, unknown> = { name: u.name, appProperties: u.appProperties, ...(u.description ? { description: u.description } : {}) };
  if (!u.id) meta.parents = ['appDataFolder'];
  const path = u.id ? `/files/${encodeURIComponent(u.id)}` : '/files'; const method = u.id ? 'PATCH' : 'POST';
  if (u.blob.size <= MULTIPART_MAX) {
    const b = `pothub${crypto.randomUUID()}`;
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${u.mime}\r\n\r\n`, u.blob, `\r\n--${b}--`]);
    const r = await call(token, `${UP}${path}?uploadType=multipart&fields=id`, { method, headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
    return (await r.json() as { id: string }).id;
  }
  const start = await call(token, `${UP}${path}?uploadType=resumable&fields=id`, { method, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': u.mime, 'X-Upload-Content-Length': String(u.blob.size) }, body: JSON.stringify(meta) });
  const where = start.headers.get('Location'); if (!where) throw new DriveError('other', 'Google Drive did not start the upload.');
  const r = await call(token, where, { method: 'PUT', headers: { 'Content-Type': u.mime }, body: u.blob });
  return (await r.json() as { id: string }).id;
}

export async function remove(token: string, id: string): Promise<void> { await call(token, `${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
