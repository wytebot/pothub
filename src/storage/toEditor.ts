import { AUDIO_TRACK, end, makeClip, type Aspect, type Clip } from '../editor/model';
import { createProject, getProject, putBundle, uid, type MediaRecord } from './db';

function mediaSize(r: MediaRecord): Promise<{ seconds: number; w: number; h: number }> {
  return new Promise((res) => {
    const url = URL.createObjectURL(r.blob); const done = (v: { seconds: number; w: number; h: number }) => { URL.revokeObjectURL(url); res(v); };
    if (r.kind === 'image') { const i = new Image(); i.onload = () => done({ seconds: 5, w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => done({ seconds: 5, w: 0, h: 0 }); i.src = url; return; }
    const e = document.createElement(r.kind === 'audio' ? 'audio' : 'video'); e.preload = 'metadata';
    e.onloadedmetadata = () => done({ seconds: isFinite(e.duration) && e.duration > 0 ? e.duration : 5, w: (e as HTMLVideoElement).videoWidth || 0, h: (e as HTMLVideoElement).videoHeight || 0 });
    e.onerror = () => done({ seconds: 5, w: 0, h: 0 }); e.src = url;
  });
}
const aspectFor = (w: number, h: number): Aspect => (!w || !h ? '16:9' : Math.abs(w / h - 1) < 0.15 ? '1:1' : w > h ? '16:9' : '9:16');

/**
 * Copies the chosen media into a project and lays it on the timeline one after another (audio from the start), then returns the project id.
 * `target` is an existing project id, or 'new' to start a fresh one named after the first item.
 */
export async function sendToEditor(records: MediaRecord[], target: string | 'new'): Promise<string> {
  const usable = records.filter((r) => r.kind === 'image' || r.kind === 'video' || r.kind === 'audio');
  if (!usable.length) throw new Error('Pick at least one photo, video or audio file to edit.');
  const project = target === 'new' ? await createProject(usable[0].name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'New edit') : await getProject(target);
  if (!project) throw new Error('That project was not found. It may have been deleted.');
  const clips: Clip[] = [...((project.data.clips as Clip[] | undefined) ?? [])];
  let at = Math.max(0, ...clips.filter((c) => c.track === 0).map(end));
  let aspect = (project.data.aspect as Aspect | undefined) ?? '16:9'; let first = !clips.length;
  const media: MediaRecord[] = [];
  for (const r of usable) {
    const info = await mediaSize(r); const copy: MediaRecord = { ...r, id: uid(), projectId: project.id }; media.push(copy);
    if (first && r.kind !== 'audio') { aspect = aspectFor(info.w, info.h); first = false; }
    clips.push(makeClip({ id: uid(), kind: r.kind, name: r.name, mediaId: copy.id, start: r.kind === 'audio' ? 0 : at, duration: info.seconds, srcDuration: r.kind === 'image' ? undefined : info.seconds, ...(r.kind === 'audio' ? { track: AUDIO_TRACK } : {}) }));
    if (r.kind !== 'audio') at += info.seconds;
  }
  await putBundle({ ...project, data: { ...project.data, aspect, clips }, updatedAt: Date.now() }, media);
  return project.id;
}
