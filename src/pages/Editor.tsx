import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, listLibrary, listMedia, putBundle, putMedia, uid, type MediaRecord, type ProjectRecord, listProjects } from '../storage/db';
import { activeAt, AUDIO_TRACK, canvasSize, end, fadeFactor, fillScale, makeClip, maxDuration, neighborCut, rippleDelete, snapPoints, snapTo, speedOf, splitClip, srcAt, totalDuration, trimEndTo, trimStartTo, withSpeed, type Aspect, type Clip, type TimelineData } from '../editor/model';
import { platform } from '../platform';
import { Select } from '../ui/Select';

const ROWS = [{ track: 2, label: 'Layer 3' }, { track: 1, label: 'Layer 2' }, { track: 0, label: 'Layer 1' }, { track: AUDIO_TRACK, label: 'Audio' }];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
type El = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
const FRAME = 1 / 30; const LABEL_W = 64;
/** Where a clip was drawn on the preview, as fractions of the canvas, so the preview can be tapped and dragged. */
interface Box { id: string; cx: number; cy: number; w: number; h: number; rot: number; }
const natural = (e: El | null) => (e instanceof HTMLVideoElement ? { iw: e.videoWidth, ih: e.videoHeight } : e instanceof HTMLImageElement ? { iw: e.naturalWidth, ih: e.naturalHeight } : { iw: 0, ih: 0 });
const tickLabel = (t: number) => (t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${Number.isInteger(t) ? t : t.toFixed(1)}s`);

/** Audio waveform drawn behind an audio clip. Memoised so it is not rebuilt on every playback frame. */
const Wave = memo(function Wave({ peaks, a, b }: { peaks: number[]; a: number; b: number }) {
  const i0 = Math.min(peaks.length - 1, Math.floor(a * peaks.length)); const i1 = Math.max(i0 + 1, Math.min(peaks.length, Math.ceil(b * peaks.length))); const n = i1 - i0;
  let d = ''; for (let i = 0; i < n; i++) { const v = Math.max(0.05, peaks[i0 + i] ?? 0) * 9; d += `M${i} ${10 - v}V${10 + v}`; }
  return <svg className="wave" viewBox={`0 0 ${n} 20`} preserveAspectRatio="none" aria-hidden="true"><path d={d} /></svg>;
});

function probe(blob: Blob, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((res) => { const e = document.createElement(kind); const u = URL.createObjectURL(blob); e.preload = 'metadata'; e.onloadedmetadata = () => { res(isFinite(e.duration) ? e.duration : 5); URL.revokeObjectURL(u); }; e.onerror = () => { res(5); URL.revokeObjectURL(u); }; e.src = u; });
}

export function Editor({ projectId }: { projectId?: string }) {
  const [project, setProject] = useState<ProjectRecord | null | undefined>(undefined);
  const [list, setList] = useState<ProjectRecord[]>([]);
  useEffect(() => { if (projectId) getProject(projectId).then((p) => setProject(p ?? null)); else { setProject(undefined); listProjects().then(setList); } }, [projectId]);
  if (!projectId) return (
    <section className="page"><h1>Creative Editor</h1>
      <div className="panel">{list.length === 0 ? <p className="muted">Create a project first, then open it in the editor.</p> : <><h2>Open a project</h2><ul className="list flush">{list.map((p) => <li key={p.id} className="item"><a className="title grow" href={`#/editor/${p.id}`}>{p.name}</a></li>)}</ul></>}</div>
    </section>);
  if (project === undefined) return <section className="page"><p className="muted">Loading…</p></section>;
  if (project === null) return <section className="page"><h1>Creative Editor</h1><div className="notice error">This project was not found. It may have been deleted.</div></section>;
  return <Workspace key={project.id} project={project} />;
}

function Workspace({ project }: { project: ProjectRecord }) {
  const init = project.data as Partial<TimelineData>;
  const [data, setDataRaw] = useState<TimelineData>({ aspect: init.aspect ?? '16:9', clips: init.clips ?? [] });
  const [sel, setSel] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [snap, setSnap] = useState(true);
  const [guide, setGuide] = useState<number | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [peaks, setPeaks] = useState<Record<string, { p: number[]; d: number }>>({});
  const [assets, setAssets] = useState<MediaRecord[]>([]);
  const [lib, setLib] = useState<MediaRecord[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [exp, setExp] = useState<{ fmt: 'webm' | 'png' | 'jpeg'; res: '720' | '1080'; fps: '24' | '30'; busy: boolean; pct: number }>({ fmt: 'webm', res: '720', fps: '30', busy: false, pct: 0 });

  const dataRef = useRef(data); dataRef.current = data;
  const selRef = useRef<string | null>(null); selRef.current = sel;
  const timeRef = useRef(0); const past = useRef<Clip[][]>([]); const future = useRef<Clip[][]>([]); const lastKey = useRef({ k: '', t: 0 });
  const canvas = useRef<HTMLCanvasElement>(null); const els = useRef(new Map<string, El>()); const urls = useRef(new Map<string, string>());
  const mediaMap = useRef(new Map<string, MediaRecord>()); const raf = useRef(0); const cancelExport = useRef(false);
  const boxes = useRef<Box[]>([]); const tlScroll = useRef<HTMLDivElement>(null); const rowEls = useRef(new Map<number, HTMLElement>());
  const busyMedia = useRef(new Set<string>()); const peakCtx = useRef<AudioContext | null>(null);
  const audio = useRef<{ ac: AudioContext; dest: MediaStreamAudioDestinationNode; mon: GainNode; srcs: Map<El, MediaElementAudioSourceNode> } | null>(null);
  const dur = totalDuration(data.clips);

  const refreshAssets = useCallback(async () => { const a = await listMedia(project.id); mediaMap.current = new Map(a.map((m) => [m.id, m])); setAssets(a); setLib((await listLibrary())); }, [project.id]);
  useEffect(() => { void refreshAssets(); return () => { cancelAnimationFrame(raf.current); els.current.forEach((e) => { if (e instanceof HTMLMediaElement) e.pause(); }); urls.current.forEach(URL.revokeObjectURL); void audio.current?.ac.close(); void peakCtx.current?.close(); }; }, [refreshAssets]);

  // history ------------------------------------------------------------
  const commit = (clips: Clip[], key?: string) => {
    const now = Date.now();
    if (!(key && lastKey.current.k === key && now - lastKey.current.t < 800)) { past.current.push(dataRef.current.clips); if (past.current.length > 100) past.current.shift(); }
    lastKey.current = { k: key ?? '', t: now }; future.current = []; setDataRaw({ ...dataRef.current, clips });
  };
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(dataRef.current.clips); setDataRaw({ ...dataRef.current, clips: p }); };
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(dataRef.current.clips); setDataRaw({ ...dataRef.current, clips: n }); };
  const update = (id: string, p: Partial<Clip>, key?: string) => commit(dataRef.current.clips.map((c) => (c.id === id ? { ...c, ...p } : c)), key ? `${id}:${key}` : undefined);

  // autosave -------------------------------------------------------------
  useEffect(() => {
    setSaved('saving');
    const t = setTimeout(() => { void putBundle({ ...project, data: { ...project.data, aspect: data.aspect, clips: data.clips }, updatedAt: Date.now() }, []).then(() => setSaved('saved')).catch((e) => setMsg({ text: e instanceof Error ? e.message : 'Autosave failed.', error: true })); }, 600);
    return () => clearTimeout(t);
  }, [data, project]);

  // media elements ---------------------------------------------------------
  const getEl = (c: Clip): El | null => {
    if (c.kind === 'text' || !c.mediaId) return null;
    const key = c.kind === 'image' ? c.mediaId : c.id; const have = els.current.get(key); if (have) return have;
    const rec = mediaMap.current.get(c.mediaId); if (!rec) return null;
    let url = urls.current.get(c.mediaId); if (!url) { url = URL.createObjectURL(rec.blob); urls.current.set(c.mediaId, url); }
    let e: El;
    if (c.kind === 'image') { e = new Image(); e.onload = () => draw(); }
    else { e = document.createElement(c.kind); (e as HTMLMediaElement).preload = 'auto'; if (c.kind === 'video') { (e as HTMLVideoElement).playsInline = true; e.onseeked = () => draw(); } }
    e.src = url; els.current.set(key, e); return e;
  };

  // timeline thumbnails and waveforms (built once per file, never block editing) ----------
  const loadThumb = async (c: Clip) => {
    const id = c.mediaId; if (!id || busyMedia.current.has(`t:${id}`)) return; busyMedia.current.add(`t:${id}`);
    const rec = mediaMap.current.get(id); if (!rec) { busyMedia.current.delete(`t:${id}`); return; }
    if (c.kind === 'image') { let u = urls.current.get(id); if (!u) { u = URL.createObjectURL(rec.blob); urls.current.set(id, u); } const shown = u; setThumbs((o) => ({ ...o, [id]: shown })); return; }
    const u = URL.createObjectURL(rec.blob);
    try {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = u;
      await new Promise<void>((res, rej) => { const to = setTimeout(() => rej(new Error('timeout')), 8000); v.onloadeddata = () => { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); }; v.onseeked = () => { clearTimeout(to); res(); }; v.onerror = () => { clearTimeout(to); rej(new Error('video')); }; });
      const cv = document.createElement('canvas'); cv.height = 64; cv.width = Math.max(1, Math.round((64 * v.videoWidth) / (v.videoHeight || 1)));
      cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/jpeg', 0.6); setThumbs((o) => ({ ...o, [id]: url }));
    } catch { /* no thumbnail: the clip keeps its plain colour */ } finally { URL.revokeObjectURL(u); }
  };
  const loadPeaks = async (id: string) => {
    if (busyMedia.current.has(`p:${id}`)) return; busyMedia.current.add(`p:${id}`);
    const rec = mediaMap.current.get(id); if (!rec || rec.blob.size > 40_000_000) return;
    try {
      const ac = peakCtx.current ?? (peakCtx.current = new AudioContext());
      const buf = await ac.decodeAudioData(await rec.blob.arrayBuffer()); const ch = buf.getChannelData(0);
      const N = 400; const step = Math.max(1, Math.floor(ch.length / N)); const stride = Math.max(1, step >> 6); const p: number[] = [];
      for (let i = 0; i < N; i++) { let m = 0; const s = i * step; for (let j = s; j < Math.min(ch.length, s + step); j += stride) { const v = Math.abs(ch[j]); if (v > m) m = v; } p.push(m); }
      const top = Math.max(0.01, ...p); setPeaks((o) => ({ ...o, [id]: { p: p.map((v) => v / top), d: buf.duration } }));
    } catch { /* cannot be decoded here: no waveform */ }
  };
  useEffect(() => { for (const c of data.clips) { if (!c.mediaId) continue; if (c.kind === 'audio') void loadPeaks(c.mediaId); else if (c.kind === 'image' || c.kind === 'video') void loadThumb(c); } }, [data.clips, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  const render = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, record = false) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); if (record) boxes.current = [];
    const vis = activeAt(dataRef.current.clips, t).filter((c) => c.kind !== 'audio').sort((a, b) => a.track - b.track);
    for (const c of vis) {
      ctx.save(); ctx.globalAlpha = c.opacity * fadeFactor(c, t);
      ctx.translate(w / 2 + c.x * w, h / 2 + c.y * h); ctx.rotate((c.rotate * Math.PI) / 180); ctx.scale(c.flipX ? -1 : 1, 1);
      let bw = 0; let bh = 0;
      if (c.kind === 'text') { const fs = ((c.fontSize ?? 48) * h) / 720; ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.fillStyle = c.color ?? '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; bw = ctx.measureText(c.text ?? '').width * c.scale; bh = fs * 1.25 * c.scale; ctx.scale(c.scale, c.scale); ctx.fillText(c.text ?? '', 0, 0); }
      else {
        const e = getEl(c); const { iw, ih } = natural(e);
        if (e && iw && ih) { const s = Math.min(w / iw, h / ih) * c.scale; bw = iw * s; bh = ih * s; ctx.filter = `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation})`; ctx.drawImage(e as CanvasImageSource, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s); }
      }
      ctx.restore();
      if (record && bw > 0) boxes.current.push({ id: c.id, cx: 0.5 + c.x, cy: 0.5 + c.y, w: bw / w, h: bh / h, rot: c.rotate });
    }
  };
  const draw = () => {
    const cv = canvas.current; if (!cv) return; const { w, h } = canvasSize(dataRef.current.aspect, 720); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d')!; render(ctx, w, h, timeRef.current, true);
    const b = boxes.current.find((x) => x.id === selRef.current);
    if (b) { ctx.save(); ctx.translate(b.cx * w, b.cy * h); ctx.rotate((b.rot * Math.PI) / 180); ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = Math.max(2, h / 360); ctx.setLineDash([h / 90, h / 150]); ctx.strokeRect((-b.w * w) / 2, (-b.h * h) / 2, b.w * w, b.h * h); ctx.restore(); }
  };

  const syncMedia = (t: number, playingNow: boolean) => {
    for (const c of dataRef.current.clips) {
      if (c.kind !== 'video' && c.kind !== 'audio') continue;
      const e = getEl(c) as HTMLMediaElement | null; if (!e) continue;
      const on = t >= c.start && t < end(c);
      if (!on) { if (!e.paused) e.pause(); continue; }
      const target = srcAt(c, t);
      if (e.playbackRate !== speedOf(c)) e.playbackRate = speedOf(c);
      if (!playingNow || Math.abs(e.currentTime - target) > 0.35) e.currentTime = target;
      e.volume = clamp(c.volume * fadeFactor(c, t), 0, 1);
      if (playingNow && e.paused) void e.play().catch(() => {}); else if (!playingNow && !e.paused) e.pause();
    }
  };
  useEffect(() => { if (!playing) { timeRef.current = time; syncMedia(time, false); draw(); } }); // eslint-disable-line

  // keep the playhead in view while it moves
  useEffect(() => { const el = tlScroll.current; if (!el) return; const x = time * zoom + LABEL_W; if (x > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = x - el.clientWidth + 120; else if (x < el.scrollLeft + LABEL_W) el.scrollLeft = Math.max(0, x - LABEL_W); }, [time]); // eslint-disable-line react-hooks/exhaustive-deps

  // playback + export ----------------------------------------------------------
  const run = (from: number, onFrame: (t: number) => void, onEnd: () => void) => {
    const t0 = performance.now(); const stop = totalDuration(dataRef.current.clips);
    const tick = () => { const t = from + (performance.now() - t0) / 1000; if (t >= stop || cancelExport.current) { onEnd(); return; } timeRef.current = t; setTime(t); syncMedia(t, true); draw(); onFrame(t); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  const pause = () => { cancelAnimationFrame(raf.current); setPlaying(false); syncMedia(timeRef.current, false); };
  const play = () => { if (playing) { pause(); return; } const from = timeRef.current >= dur - 0.05 ? 0 : timeRef.current; setPlaying(true); cancelExport.current = false; run(from, () => {}, () => { setTime(Math.min(timeRef.current, dur)); pause(); }); };
  const seek = (t: number) => { if (playing) pause(); const v = clamp(t, 0, dur); timeRef.current = v; setTime(v); };
  const step = (d: number) => seek(timeRef.current + d);
  const cut = (dir: -1 | 1) => seek(neighborCut(dataRef.current.clips, timeRef.current, dir) ?? (dir < 0 ? 0 : dur));

  const exportNow = async () => {
    setMsg(null); const res = Number(exp.res) as 720 | 1080; const { w, h } = canvasSize(data.aspect, res);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!;
    if (exp.fmt !== 'webm') { syncMedia(time, false); render(ctx, w, h, time); const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, exp.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.95)); if (!blob) { setMsg({ text: 'Could not export this frame.', error: true }); return; } if ((await platform.saveFile(blob, `${project.name}.${exp.fmt === 'png' ? 'png' : 'jpg'}`)) === 'saved') setMsg({ text: 'Frame saved.' }); return; }
    if (typeof MediaRecorder === 'undefined') { setMsg({ text: 'This browser cannot record video exports. Try Chrome, Edge or Firefox.', error: true }); return; }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)); if (!mime) { setMsg({ text: 'WebM recording is not supported here.', error: true }); return; }
    try {
      if (!audio.current) { const ac = new AudioContext(); audio.current = { ac, dest: ac.createMediaStreamDestination(), mon: ac.createGain(), srcs: new Map() }; audio.current.mon.connect(ac.destination); }
      const a = audio.current; a.mon.gain.value = 0; await a.ac.resume();
      for (const c of data.clips) { const e = getEl(c); if ((c.kind === 'video' || c.kind === 'audio') && e instanceof HTMLMediaElement && !a.srcs.has(e)) { const s = a.ac.createMediaElementSource(e); s.connect(a.dest); s.connect(a.mon); a.srcs.set(e, s); } }
      const stream = cv.captureStream(Number(exp.fps)); a.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: res === 1080 ? 8_000_000 : 4_000_000 }); const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      cancelExport.current = false; setExp((s) => ({ ...s, busy: true, pct: 0 })); setPlaying(true); rec.start(1000);
      await new Promise<void>((resolve) => { run(0, (t) => { render(ctx, w, h, t); setExp((s) => ({ ...s, pct: Math.round((t / dur) * 100) })); }, () => { rec.onstop = () => resolve(); rec.stop(); }); });
      a.mon.gain.value = 1; pause(); setExp((s) => ({ ...s, busy: false }));
      if (cancelExport.current) { cancelExport.current = false; setMsg({ text: 'Export cancelled.' }); return; }
      if ((await platform.saveFile(new Blob(chunks, { type: 'video/webm' }), `${project.name}.webm`)) === 'saved') setMsg({ text: 'Exported as WebM. The video is re-encoded in real time, so it is not an original-quality copy of your sources.' });
    } catch (e) { pause(); setExp((s) => ({ ...s, busy: false })); setMsg({ text: e instanceof Error ? e.message : 'Export failed.', error: true }); }
  };

  // editing actions ----------------------------------------------------------------
  const selected = () => dataRef.current.clips.find((x) => x.id === selRef.current);
  const addAsset = async (rec: MediaRecord) => {
    let r = rec;
    if (rec.projectId !== project.id) { r = { ...rec, id: uid(), projectId: project.id }; await putMedia(r); await refreshAssets(); mediaMap.current.set(r.id, r); }
    const d = r.kind === 'image' ? 5 : await probe(r.blob, r.kind as 'video' | 'audio');
    const c = makeClip({ id: uid(), kind: r.kind, name: r.name, mediaId: r.id, start: timeRef.current, duration: d, srcDuration: r.kind === 'image' ? undefined : d });
    commit([...dataRef.current.clips, c]); setSel(c.id);
  };
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    try { for (const f of Array.from(files)) { const kind = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null; if (!kind) continue; await putMedia({ id: uid(), projectId: project.id, kind, name: f.name, mime: f.type, size: f.size, createdAt: Date.now(), blob: f }); } await refreshAssets(); }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Import failed.', error: true }); }
  };
  const addText = () => { const c = makeClip({ id: uid(), kind: 'text', name: 'Text', start: timeRef.current, duration: 3, track: 1, text: 'Your text', fontSize: 64, color: '#ffffff' }); commit([...dataRef.current.clips, c]); setSel(c.id); };
  const split = () => { const c = selected(); if (!c) return; const r = splitClip(c, timeRef.current, uid()); if (r) { commit(dataRef.current.clips.flatMap((x) => (x.id === c.id ? r : [x]))); setSel(r[1].id); } };
  const trim = (side: 'start' | 'end') => { const c = selected(); if (!c) return; const r = side === 'start' ? trimStartTo(c, timeRef.current) : trimEndTo(c, timeRef.current); if (r) commit(dataRef.current.clips.map((x) => (x.id === c.id ? r : x))); };
  const del = () => { const id = selRef.current; if (id) { commit(dataRef.current.clips.filter((c) => c.id !== id)); setSel(null); } };
  const ripple = () => { const id = selRef.current; if (id) { commit(rippleDelete(dataRef.current.clips, id)); setSel(null); } };
  const dup = () => { const c = selected(); if (c) { const n = { ...c, id: uid(), start: end(c) }; commit([...dataRef.current.clips, n]); setSel(n.id); } };
  const fillFrame = () => { const c = selected(); if (!c) return; const { iw, ih } = natural(getEl(c)); if (!iw || !ih) return; const { w, h } = canvasSize(dataRef.current.aspect, 720); update(c.id, { scale: fillScale(iw, ih, w, h), x: 0, y: 0 }); };
  const resetLook = () => { const c = selected(); if (c) update(c.id, { x: 0, y: 0, scale: 1, rotate: 0, flipX: false }); };
  const fitZoom = () => setZoom(clamp(((tlScroll.current?.clientWidth ?? 600) - LABEL_W - 40) / dur, 10, 300));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      const mod = e.ctrlKey || e.metaKey; const key = e.key.toLowerCase();
      if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); play(); }
      else if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && key === 'y') { e.preventDefault(); redo(); }
      else if (mod && key === 'd') { e.preventDefault(); dup(); }
      else if (mod) return;
      else if (key === 's') split();
      else if (key === 'd') dup();
      else if (key === 't') addText();
      else if (e.key === '[') trim('start');
      else if (e.key === ']') trim('end');
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(e.shiftKey ? -1 : -FRAME); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? 1 : FRAME); }
      else if (e.key === 'Home') { e.preventDefault(); seek(0); }
      else if (e.key === 'End') { e.preventDefault(); seek(dur); }
      else if (e.key === '=' || e.key === '+') setZoom((z) => clamp(z * 1.25, 10, 300));
      else if (e.key === '-') setZoom((z) => clamp(z / 1.25, 10, 300));
      else if (e.key === 'Escape') setSel(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) ripple();
      else if (e.key === 'Delete' || e.key === 'Backspace') del();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // dragging on the timeline: move, trim, snap, change layer ---------------------------------
  const startDrag = (e: React.PointerEvent, c: Clip, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation(); setSel(c.id); const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
    const x0 = e.clientX; const base = dataRef.current.clips; const snapC = c; let moved = false;
    const targets = [...snapPoints(base, c.id), timeRef.current]; const within = 9 / zoom; const media = c.kind === 'video' || c.kind === 'audio';
    const mv = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / zoom; moved = true; let n: Clip = snapC; let g: number | null = null;
      if (mode === 'move') {
        let s = Math.max(0, snapC.start + dt);
        if (snap) {
          const a = snapTo(s, targets, within); const b = snapTo(s + snapC.duration, targets, within); const sa = a !== s; const sb = b !== s + snapC.duration;
          if (sa && (!sb || Math.abs(a - s) <= Math.abs(b - s - snapC.duration))) { s = a; g = a; } else if (sb) { s = b - snapC.duration; g = b; }
          s = Math.max(0, s);
        }
        let track = snapC.track;
        for (const [tr, row] of rowEls.current) { const r = row.getBoundingClientRect(); if (ev.clientY >= r.top && ev.clientY < r.bottom && (snapC.kind === 'audio') === (tr === AUDIO_TRACK)) track = tr; }
        n = { ...snapC, start: s, track };
      } else if (mode === 'r') {
        let d = snapC.duration + dt; const at = snapC.start + d;
        if (snap) { const v = snapTo(at, targets, within); if (v !== at) { d = v - snapC.start; g = v; } }
        n = { ...snapC, duration: clamp(d, 0.2, maxDuration(snapC)) };
      } else {
        let d = dt; const at = snapC.start + d;
        if (snap) { const v = snapTo(at, targets, within); if (v !== at) { d = v - snapC.start; g = v; } }
        d = clamp(d, -Math.min(snapC.start, media ? snapC.trimIn / speedOf(snapC) : Infinity), snapC.duration - 0.2);
        n = { ...snapC, start: snapC.start + d, trimIn: media ? snapC.trimIn + d * speedOf(snapC) : 0, duration: snapC.duration - d };
      }
      setGuide(g); setDataRaw({ ...dataRef.current, clips: base.map((x) => (x.id === c.id ? n : x)) });
    };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); setGuide(null); if (moved) { past.current.push(base); future.current = []; } };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };
  const rulerSeek = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); const go = (x: number) => seek((x - r.left) / zoom); go(e.clientX); const el = e.currentTarget; el.setPointerCapture(e.pointerId); const mv = (ev: PointerEvent) => go(ev.clientX); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); };

  // tap and drag directly on the preview -----------------------------------------------------
  const hitTest = (px: number, py: number, rect: DOMRect): string | null => {
    const inside = (b: Box) => { const dx = (px - b.cx) * rect.width; const dy = (py - b.cy) * rect.height; const r = (-b.rot * Math.PI) / 180; const rx = dx * Math.cos(r) - dy * Math.sin(r); const ry = dx * Math.sin(r) + dy * Math.cos(r); return Math.abs(rx) <= (b.w * rect.width) / 2 && Math.abs(ry) <= (b.h * rect.height) / 2; };
    const mine = boxes.current.find((b) => b.id === selRef.current); if (mine && inside(mine)) return mine.id; // keep dragging the chosen clip when clips overlap
    for (let i = boxes.current.length - 1; i >= 0; i--) if (inside(boxes.current[i])) return boxes.current[i].id;
    return null;
  };
  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget; const rect = el.getBoundingClientRect();
    const id = hitTest((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, rect); setSel(id); if (!id) return;
    const base = dataRef.current.clips.find((x) => x.id === id); if (!base) return; el.setPointerCapture(e.pointerId); const x0 = e.clientX; const y0 = e.clientY;
    const mv = (ev: PointerEvent) => { let nx = base.x + (ev.clientX - x0) / rect.width; let ny = base.y + (ev.clientY - y0) / rect.height; if (snap) { if (Math.abs(nx) < 0.02) nx = 0; if (Math.abs(ny) < 0.02) ny = 0; } update(id, { x: nx, y: ny }, 'pos'); };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };

  const pts = useRef(new Map<number, { x: number; y: number }>()); const pinch = useRef(0);
  const onTlDown = (ev: React.PointerEvent) => { pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); pinch.current = 0; };
  const onTlMove = (ev: React.PointerEvent) => {
    if (!pts.current.has(ev.pointerId)) return; pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.current.size !== 2) return; const [a, b] = [...pts.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.current > 0) setZoom((z) => clamp((z * d) / pinch.current, 10, 300)); pinch.current = d;
  };
  const onTlUp = (ev: React.PointerEvent) => { pts.current.delete(ev.pointerId); pinch.current = 0; };
  const c = useMemo(() => data.clips.find((x) => x.id === sel), [data.clips, sel]);
  const isMedia = c?.kind === 'video' || c?.kind === 'audio';
  const slider = (label: string, key: keyof Clip, min: number, max: number, step = 0.01) => c && (
    <label className="field">{label} <span className="muted">{Number(c[key]).toFixed(2)}</span>
      <input type="range" min={min} max={max} step={step} value={Number(c[key])} onChange={(e) => update(c.id, { [key]: Number(e.target.value) } as Partial<Clip>, String(key))} /></label>);
  const num = (label: string, key: 'start' | 'duration' | 'trimIn') => c && (
    <label className="field">{label} (s)<input type="number" step="0.1" min={0} value={Number(c[key].toFixed(2))} onChange={(e) => { const v = Math.max(key === 'duration' ? 0.2 : 0, Number(e.target.value)); update(c.id, { [key]: key === 'duration' ? Math.min(v, maxDuration(c)) : v } as Partial<Clip>, key); }} /></label>);

  const tickStep = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * zoom >= 56) ?? 600;
  const ticks = Array.from({ length: Math.floor(dur / tickStep) + 2 }, (_, i) => i * tickStep);

  return (
    <section className="editor">
      <header className="ed-bar">
        <a className="small" href="#/projects">Projects</a><strong className="grow title">{project.name}</strong>
        <span className="muted small" role="status">{saved === 'saving' ? 'Saving…' : 'Saved'}</span>
        <Select<Aspect> label="Canvas shape" value={data.aspect} onChange={(a) => setDataRaw({ ...data, aspect: a })} options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
      </header>
      {msg && <div className={`notice${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</div>}
      <div className="ed-main">
        <aside className="ed-side ed-media panel">
          <h2>Media</h2>
          <label className="btn file">Import files<input type="file" multiple hidden accept="image/*,video/*,audio/*" onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} /></label>
          <ul className="list flush assets">{assets.map((a) => <li key={a.id} className="item"><span className="grow title small">{a.name}</span><button className="btn sm" onClick={() => addAsset(a)}>Add</button></li>)}</ul>
          {lib.length > 0 && <><h2>Generated</h2><ul className="list flush assets">{lib.map((a) => <li key={a.id} className="item"><span className="grow title small">{a.name}</span><button className="btn sm" onClick={() => addAsset(a)}>Add</button></li>)}</ul></>}
          {assets.length + lib.length === 0 && <p className="muted small">Import media or generate some in the studios.</p>}
        </aside>
        <div className="ed-center">
          <div className="stage"><canvas ref={canvas} className="cv" style={{ aspectRatio: data.aspect.replace(':', '/') }} onPointerDown={onCanvasDown} aria-label="Preview. Tap a layer to select it, drag to move it." /></div>
          <div className="ed-transport">
            <div className="ed-group">
              <button className="btn" aria-label="Go to start" onClick={() => seek(0)}>Start</button>
              <button className="btn" aria-label="Previous cut" onClick={() => cut(-1)}>‹ Cut</button>
              <button className="btn primary" onClick={play}>{playing ? 'Pause' : 'Play'}</button>
              <button className="btn" aria-label="Next cut" onClick={() => cut(1)}>Cut ›</button>
              <button className="btn" aria-label="Go to end" onClick={() => seek(dur)}>End</button>
              <span className="time small" aria-label="Playhead time">{fmt(time)} / {fmt(dur)}</span>
            </div>
            <div className="ed-group">
              <button className="btn" disabled={!past.current.length} onClick={undo}>Undo</button>
              <button className="btn" disabled={!future.current.length} onClick={redo}>Redo</button>
              <button className="btn" disabled={!c} onClick={split}>Split</button>
              <button className="btn" disabled={!c} onClick={() => trim('start')} title="Cut everything before the playhead">Trim start</button>
              <button className="btn" disabled={!c} onClick={() => trim('end')} title="Cut everything after the playhead">Trim end</button>
              <button className="btn" disabled={!c} onClick={dup}>Duplicate</button>
              <button className="btn" disabled={!c} onClick={del}>Delete</button>
              <button className="btn" disabled={!c} onClick={ripple} title="Delete and close the gap">Ripple delete</button>
              <button className="btn" onClick={addText}>Add text</button>
            </div>
            <div className="ed-group">
              <button className="btn" aria-pressed={snap} onClick={() => setSnap(!snap)} title="Snap to cuts, the playhead and the frame centre">Snap {snap ? 'on' : 'off'}</button>
              <button className="btn" onClick={() => setZoom((z) => clamp(z / 1.4, 10, 300))}>Zoom out</button>
              <button className="btn" onClick={() => setZoom((z) => clamp(z * 1.4, 10, 300))}>Zoom in</button>
              <button className="btn" onClick={fitZoom}>Fit</button>
            </div>
          </div>
        </div>
        <aside className="ed-side ed-props panel">
          <h2>{c ? 'Properties' : 'Export'}</h2>
          {c ? (<div className="stack">
            {num('Start', 'start')}{num('Length', 'duration')}{isMedia ? num('Source offset', 'trimIn') : null}
            {isMedia && (
              <div className="field"><span>Speed <span className="muted">{speedOf(c).toFixed(2)}×</span></span>
                <input type="range" min={0.25} max={4} step={0.05} value={speedOf(c)} aria-label="Speed" onChange={(e) => update(c.id, withSpeed(c, Number(e.target.value)), 'speed')} />
                <div className="row">{[0.5, 1, 1.5, 2].map((v) => <button key={v} className="btn sm" onClick={() => update(c.id, withSpeed(c, v))}>{v}×</button>)}</div></div>)}
            {c.kind !== 'audio' && <>{slider('Opacity', 'opacity', 0, 1)}{slider('Scale', 'scale', 0.1, 5)}{slider('Rotate', 'rotate', -180, 180, 1)}{slider('Position X', 'x', -1, 1)}{slider('Position Y', 'y', -1, 1)}
              {c.kind !== 'text' && <>{slider('Brightness', 'brightness', 0, 2)}{slider('Contrast', 'contrast', 0, 2)}{slider('Saturation', 'saturation', 0, 2)}</>}
              <div className="row">
                {c.kind !== 'text' && <button className="btn" onClick={fillFrame} title="Scale up until the picture covers the whole frame">Fill frame</button>}
                <button className="btn" onClick={resetLook}>Reset position</button>
                <button className="btn" onClick={() => update(c.id, { flipX: !c.flipX })}>{c.flipX ? 'Unflip' : 'Flip'}</button>
              </div>
              <Select label="Layer" value={String(c.track)} onChange={(v) => update(c.id, { track: Number(v) })} options={[{ value: '0', label: 'Layer 1 (back)' }, { value: '1', label: 'Layer 2' }, { value: '2', label: 'Layer 3 (front)' }]} /></>}
            {c.kind === 'text' && <><label className="field">Text<input value={c.text ?? ''} onChange={(e) => update(c.id, { text: e.target.value }, 'text')} /></label>{slider('Size', 'fontSize', 12, 200, 1)}<label className="field">Colour<input type="color" value={c.color ?? '#ffffff'} onChange={(e) => update(c.id, { color: e.target.value }, 'color')} /></label></>}
            {isMedia && slider('Volume', 'volume', 0, 1)}
            {slider('Fade in (s)', 'fadeIn', 0, 5)}{slider('Fade out (s)', 'fadeOut', 0, 5)}
            <button className="btn" onClick={() => setSel(null)}>Done</button>
          </div>) : (<div className="stack">
            <Select label="Format" value={exp.fmt} onChange={(v) => setExp({ ...exp, fmt: v })} options={[{ value: 'webm', label: 'WebM video' }, { value: 'png', label: 'PNG frame' }, { value: 'jpeg', label: 'JPEG frame' }]} />
            <Select label="Resolution" value={exp.res} onChange={(v) => setExp({ ...exp, res: v })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }]} />
            {exp.fmt === 'webm' && <Select label="Frame rate" value={exp.fps} onChange={(v) => setExp({ ...exp, fps: v })} options={[{ value: '24', label: '24 fps' }, { value: '30', label: '30 fps' }]} />}
            {exp.busy ? <><div className="meter"><div style={{ width: `${exp.pct}%` }} /></div><button className="btn" onClick={() => { cancelExport.current = true; }}>Cancel export</button></> : <button className="btn primary" disabled={data.clips.length === 0} onClick={exportNow}>Export</button>}
            <p className="muted small">Video export records the timeline in real time as WebM, so it takes as long as your video and is re-encoded. MP4 export is not available yet. Frame exports use the playhead position.</p>
          </div>)}
        </aside>
      </div>
      <div className="ed-timeline panel">
        <div ref={tlScroll} className="tl-scroll" onPointerDown={onTlDown} onPointerMove={onTlMove} onPointerUp={onTlUp} onPointerCancel={onTlUp} onWheel={(ev) => { if (ev.ctrlKey) { ev.preventDefault(); setZoom((z) => clamp(z * (ev.deltaY < 0 ? 1.1 : 0.9), 10, 300)); } }}>
          <div className="tl-inner" style={{ width: dur * zoom + 120 }}>
            <div className="ruler" onPointerDown={rulerSeek}>{ticks.map((t) => <span key={t} style={{ left: t * zoom }}>{tickLabel(t)}</span>)}</div>
            {ROWS.map((r) => (
              <div key={r.track} ref={(el) => { if (el) rowEls.current.set(r.track, el); else rowEls.current.delete(r.track); }} className="trow" onPointerDown={() => setSel(null)}>
                <span className="tlabel">{r.label}</span>
                {data.clips.filter((x) => x.track === r.track).map((x) => {
                  const th = x.mediaId && x.kind !== 'audio' && x.kind !== 'text' ? thumbs[x.mediaId] : undefined; const pk = x.kind === 'audio' && x.mediaId ? peaks[x.mediaId] : undefined; const sp = speedOf(x);
                  return (
                    <div key={x.id} className={`clip ${x.kind}${x.id === sel ? ' sel' : ''}${th ? ' has-thumb' : ''}`} style={{ left: x.start * zoom, width: Math.max(8, x.duration * zoom), ...(th ? { backgroundImage: `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)), url(${th})` } : {}) }} onPointerDown={(e) => startDrag(e, x, 'move')} role="button" tabIndex={0} aria-label={`${x.name}, ${x.kind} clip`}>
                      {pk && <Wave peaks={pk.p} a={Math.round(clamp(x.trimIn / pk.d, 0, 1) * 1000) / 1000} b={Math.round(clamp((x.trimIn + x.duration * sp) / pk.d, 0, 1) * 1000) / 1000} />}
                      <i className="h l" onPointerDown={(e) => startDrag(e, x, 'l')} /><span>{x.kind === 'text' ? x.text : x.name}{sp !== 1 ? ` · ${Number(sp.toFixed(2))}×` : ''}</span><i className="h r" onPointerDown={(e) => startDrag(e, x, 'r')} />
                    </div>);
                })}
              </div>))}
            {data.clips.length === 0 && <p className="tl-empty muted small">Add media from the left. It lands at the playhead.</p>}
            {guide !== null && <div className="guide" style={{ left: guide * zoom }} />}
            <div className="playhead" style={{ left: time * zoom }} />
          </div>
        </div>
        <p className="muted small">Space plays, S splits, [ and ] trim to the playhead, D duplicates, Delete removes (Shift+Delete closes the gap), arrows step a frame (Shift: one second), Ctrl+Z undoes. Drag clips to move them or switch layer, drag their edges to trim, pinch or Ctrl+scroll to zoom.</p>
      </div>
    </section>
  );
}
