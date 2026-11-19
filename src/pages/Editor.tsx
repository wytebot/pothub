import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, listLibrary, listMedia, putBundle, putMedia, uid, type MediaRecord, type ProjectRecord, listProjects } from '../storage/db';
import { activeAt, AUDIO_TRACK, canvasSize, clock, end, fadeFactor, filterOf, fillScale, FX, makeClip, maxDuration, neighborCut, parseSrt, rippleDelete, snapPoints, snapTo, speedOf, splitClip, srcAt, totalDuration, trimEndTo, trimStartTo, withSpeed, type Aspect, type Clip, type TimelineData } from '../editor/model';
import { Icon, type IconName } from '../ui/Icon';
import { platform } from '../platform';
import { Select } from '../ui/Select';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
type El = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
const FRAME = 1 / 30;
/** Where a clip was drawn on the preview, as fractions of the canvas, so the preview can be tapped and dragged. */
interface Box { id: string; cx: number; cy: number; w: number; h: number; rot: number; }
const natural = (e: El | null) => (e instanceof HTMLVideoElement ? { iw: e.videoWidth, ih: e.videoHeight } : e instanceof HTMLImageElement ? { iw: e.naturalWidth, ih: e.naturalHeight } : { iw: 0, ih: 0 });

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

type Panel = '' | 'speed' | 'volume' | 'fade' | 'adjust' | 'fx' | 'transform' | 'length' | 'text' | 'captions' | 'ratio' | 'export';
type MediaMode = '' | 'visual' | 'overlay' | 'audio';
interface Tool { id: string; icon: IconName; label: string; run: () => void; off?: boolean; danger?: boolean; on?: boolean; }
const TITLES: Record<Panel, string> = { '': '', speed: 'Speed', volume: 'Volume', fade: 'Fade', adjust: 'Adjust', fx: 'Effects', transform: 'Position and size', length: 'Timing', text: 'Text', captions: 'Captions', ratio: 'Ratio', export: 'Export' };
const H_MAIN = 60; const H_ROW = 34; const H_RULER = 26;

function Slider({ label, value, min, max, step = 0.01, show, onChange }: { label: string; value: number; min: number; max: number; step?: number; show?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="cc-slider"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /><b>{show ? show(value) : value.toFixed(2)}</b></label>
  );
}

/** The "add media" sheet: project files and generated media as a grid, plus Import from the device. */
function MediaSheet({ mode, items, onPick, onImport, onClose }: { mode: Exclude<MediaMode, ''>; items: MediaRecord[]; onPick: (r: MediaRecord) => void; onImport: (f: FileList) => void; onClose: () => void }) {
  const shown = useMemo(() => { const seen = new Set<string>(); return items.filter((m) => (mode === 'audio' ? m.kind === 'audio' : m.kind !== 'audio') && !seen.has(m.id) && seen.add(m.id)); }, [items, mode]);
  const urls = useMemo(() => new Map(shown.filter((m) => m.kind !== 'audio').map((m) => [m.id, URL.createObjectURL(m.blob)])), [shown]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="cc-sheet cc-media" role="dialog" aria-label={mode === 'audio' ? 'Add audio' : mode === 'overlay' ? 'Add overlay' : 'Add media'}>
      <div className="cc-sheet-head"><strong>{mode === 'audio' ? 'Add audio' : mode === 'overlay' ? 'Add overlay' : 'Add media'}</strong>
        <label className="cc-icon" title="Import from this device" aria-label="Import from this device"><Icon name="plus" size={22} /><input type="file" hidden multiple accept={mode === 'audio' ? 'audio/*' : 'image/*,video/*'} onChange={(e) => { if (e.target.files?.length) onImport(e.target.files); e.target.value = ''; }} /></label>
        <button className="cc-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={22} /></button></div>
      <div className="cc-grid">
        {shown.length === 0 && <p className="muted small cc-empty">Nothing here yet. Tap + to bring in {mode === 'audio' ? 'audio' : 'photos and videos'} from this device, or generate some in the studios.</p>}
        {shown.map((m) => (
          <button key={m.id} className="cc-tile" onClick={() => onPick(m)} title={m.name} aria-label={`Add ${m.name}`}>
            {m.kind === 'image' ? <img src={urls.get(m.id)} alt="" /> : m.kind === 'video' ? <video src={`${urls.get(m.id)}#t=0.1`} muted playsInline preload="metadata" /> : <span className="cc-note"><Icon name="music" size={26} /></span>}
            <span className="cc-tile-name">{m.name}</span>
          </button>))}
      </div>
    </div>
  );
}

function Workspace({ project }: { project: ProjectRecord }) {
  const init = project.data as Partial<TimelineData> & { cover?: string };
  const [data, setDataRaw] = useState<TimelineData>({ aspect: init.aspect ?? '16:9', clips: init.clips ?? [] });
  const [cover, setCover] = useState<string | undefined>(init.cover);
  const [sel, setSel] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [timelineHeight, setTimelineHeight] = useState(250);
  const [pad, setPad] = useState(180);
  const [snap, setSnap] = useState(true);
  const [guide, setGuide] = useState<number | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [peaks, setPeaks] = useState<Record<string, { p: number[]; d: number }>>({});
  const [assets, setAssets] = useState<MediaRecord[]>([]);
  const [lib, setLib] = useState<MediaRecord[]>([]);
  const [panel, setPanel] = useState<Panel>('');
  const [media, setMedia] = useState<MediaMode>('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [exp, setExp] = useState<{ fmt: 'webm' | 'png' | 'jpeg'; res: '720' | '1080'; fps: '24' | '30'; busy: boolean; pct: number }>({ fmt: 'webm', res: '720', fps: '30', busy: false, pct: 0 });

  const dataRef = useRef(data); dataRef.current = data;
  const selRef = useRef<string | null>(null); selRef.current = sel;
  const playingRef = useRef(false); playingRef.current = playing;
  const timeRef = useRef(0); const past = useRef<Clip[][]>([]); const future = useRef<Clip[][]>([]); const lastKey = useRef({ k: '', t: 0 });
  const canvas = useRef<HTMLCanvasElement>(null); const stage = useRef<HTMLDivElement>(null); const els = useRef(new Map<string, El>()); const urls = useRef(new Map<string, string>());
  const mediaMap = useRef(new Map<string, MediaRecord>()); const raf = useRef(0); const cancelExport = useRef(false);
  const boxes = useRef<Box[]>([]); const longPress = useRef<{ timer: number; x: number; y: number } | null>(null); const canvasPts = useRef(new Map<number, { x: number; y: number }>()); const canvasPinch = useRef<{ distance: number; scale: number; id: string } | null>(null); const tlScroll = useRef<HTMLDivElement>(null); const rowEls = useRef(new Map<number, HTMLElement>());
  const busyMedia = useRef(new Set<string>()); const peakCtx = useRef<AudioContext | null>(null);
  const audio = useRef<{ ac: AudioContext; dest: MediaStreamAudioDestinationNode; mon: GainNode; srcs: Map<El, MediaElementAudioSourceNode> } | null>(null);
  const dur = totalDuration(data.clips);

  const refreshAssets = useCallback(async () => { const a = await listMedia(project.id); mediaMap.current = new Map(a.map((m) => [m.id, m])); setAssets(a); setLib(await listLibrary()); }, [project.id]);
  useEffect(() => { void refreshAssets(); return () => { cancelAnimationFrame(raf.current); els.current.forEach((e) => { if (e instanceof HTMLMediaElement) e.pause(); }); urls.current.forEach(URL.revokeObjectURL); void audio.current?.ac.close(); void peakCtx.current?.close(); }; }, [refreshAssets]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), msg.error ? 7000 : 3500); return () => clearTimeout(t); }, [msg]);

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
    const t = setTimeout(() => { void putBundle({ ...project, data: { ...project.data, aspect: data.aspect, clips: data.clips, ...(cover ? { cover } : {}) }, updatedAt: Date.now() }, []).then(() => setSaved('saved')).catch((e) => setMsg({ text: e instanceof Error ? e.message : 'Autosave failed.', error: true })); }, 600);
    return () => clearTimeout(t);
  }, [data, project, cover]);

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
      const cv = document.createElement('canvas'); cv.height = 96; cv.width = Math.max(1, Math.round((96 * v.videoWidth) / (v.videoHeight || 1)));
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
      if (c.kind === 'text') { const fs = ((c.fontSize ?? 48) * h) / 720; ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.fillStyle = c.color ?? '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = fs * 0.12; bw = ctx.measureText(c.text ?? '').width * c.scale; bh = fs * 1.25 * c.scale; ctx.scale(c.scale, c.scale); ctx.fillText(c.text ?? '', 0, 0); }
      else {
        const e = getEl(c); const { iw, ih } = natural(e);
        if (e && iw && ih) { const s = Math.min(w / iw, h / ih) * c.scale; bw = iw * s; bh = ih * s; ctx.filter = filterOf(c, h); ctx.drawImage(e as CanvasImageSource, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s); }
      }
      ctx.restore();
      if (record && bw > 0) boxes.current.push({ id: c.id, cx: 0.5 + c.x, cy: 0.5 + c.y, w: bw / w, h: bh / h, rot: c.rotate });
    }
  };
  const draw = () => {
    const cv = canvas.current; if (!cv) return; const { w, h } = canvasSize(dataRef.current.aspect, 720); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d')!; render(ctx, w, h, timeRef.current, true);
    const b = boxes.current.find((x) => x.id === selRef.current);
    if (b) { ctx.save(); ctx.translate(b.cx * w, b.cy * h); ctx.rotate((b.rot * Math.PI) / 180); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, h / 360); ctx.setLineDash([h / 90, h / 150]); ctx.strokeRect((-b.w * w) / 2, (-b.h * h) / 2, b.w * w, b.h * h); ctx.restore(); }
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

  // the timeline scrolls under a fixed playhead (like CapCut): scroll position <-> time -------------
  useEffect(() => { const el = tlScroll.current; if (!el) return; const f = () => setPad(Math.round(el.clientWidth / 2)); f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => { const el = tlScroll.current; if (!el) return; const x = time * zoom; if (Math.abs(el.scrollLeft - x) > 1) el.scrollLeft = x; }, [time, zoom, pad, data.clips.length]);
  const onTlScroll = () => { const el = tlScroll.current; if (!el || playingRef.current) return; if (Math.abs(el.scrollLeft - timeRef.current * zoom) < 1.5) return; seek(el.scrollLeft / zoom); };

  // playback + export ----------------------------------------------------------
  const run = (from: number, onFrame: (t: number) => void, onEnd: () => void) => {
    const t0 = performance.now(); const stop = totalDuration(dataRef.current.clips);
    const tick = () => { const t = from + (performance.now() - t0) / 1000; if (t >= stop || cancelExport.current) { onEnd(); return; } timeRef.current = t; setTime(t); syncMedia(t, true); draw(); onFrame(t); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  const pause = () => { cancelAnimationFrame(raf.current); setPlaying(false); syncMedia(timeRef.current, false); };
  const play = () => { if (playing) { pause(); return; } const from = timeRef.current >= dur - 0.05 ? 0 : timeRef.current; setPlaying(true); cancelExport.current = false; run(from, () => {}, () => { setTime(Math.min(timeRef.current, dur)); pause(); }); };
  const seek = (t: number) => { if (playingRef.current) pause(); const v = clamp(t, 0, dur); timeRef.current = v; setTime(v); };
  const step = (d: number) => seek(timeRef.current + d);
  const cut = (dir: -1 | 1) => seek(neighborCut(dataRef.current.clips, timeRef.current, dir) ?? (dir < 0 ? 0 : dur));
  const fullscreen = () => { const el = stage.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null; if (!el) return; try { if (document.fullscreenElement) void document.exitFullscreen(); else if (el.requestFullscreen) void el.requestFullscreen(); else el.webkitRequestFullscreen?.(); } catch { /* not supported here */ } };

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
  /** The chosen clip, or else the picture or video under the playhead (main track first), so Edit and Effects always have something to work on. */
  const target = (): Clip | undefined => selected() ?? activeAt(dataRef.current.clips, timeRef.current).filter((x) => x.kind !== 'audio' && x.kind !== 'text').sort((a, b) => a.track - b.track)[0];
  const mainEnd = () => Math.max(0, ...dataRef.current.clips.filter((c) => c.track === 0).map(end));
  const addAsset = async (rec: MediaRecord, mode: MediaMode) => {
    let r = rec;
    if (rec.projectId !== project.id) { r = { ...rec, id: uid(), projectId: project.id }; await putMedia(r); await refreshAssets(); mediaMap.current.set(r.id, r); }
    const d = r.kind === 'image' ? 5 : await probe(r.blob, r.kind as 'video' | 'audio');
    const onMain = mode === 'visual'; const first = !dataRef.current.clips.some((c) => c.kind === 'video' || c.kind === 'image');
    const c = makeClip({ id: uid(), kind: r.kind, name: r.name, mediaId: r.id, start: onMain ? mainEnd() : timeRef.current, duration: d, srcDuration: r.kind === 'image' ? undefined : d, ...(mode === 'overlay' ? { track: 2, scale: 0.5 } : onMain ? { track: 0 } : {}) });
    commit([...dataRef.current.clips, c]); setSel(c.id); if (onMain && first) seek(0);
  };
  const importAndAdd = async (files: FileList, mode: Exclude<MediaMode, ''>) => {
    const made: MediaRecord[] = [];
    try {
      for (const f of Array.from(files)) { const kind = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null; if (!kind || (mode === 'audio') !== (kind === 'audio')) continue; const rec: MediaRecord = { id: uid(), projectId: project.id, kind, name: f.name, mime: f.type, size: f.size, createdAt: Date.now(), blob: f }; await putMedia(rec); made.push(rec); }
      await refreshAssets(); setMedia('');
      for (const r of made) await addAsset(r, mode);
      if (!made.length) setMsg({ text: mode === 'audio' ? 'Choose an audio file.' : 'Choose a photo or video.', error: true });
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Import failed.', error: true }); }
  };
  const addText = (text = 'Your text') => { const c = makeClip({ id: uid(), kind: 'text', name: 'Text', start: timeRef.current, duration: 3, track: 1, text, fontSize: 64, color: '#ffffff' }); commit([...dataRef.current.clips, c]); setSel(c.id); setPanel('text'); };
  const addCaption = () => { const c = makeClip({ id: uid(), kind: 'text', name: 'Caption', start: timeRef.current, duration: 2, track: 1, text: 'Caption', fontSize: 44, color: '#ffffff', y: 0.36 }); commit([...dataRef.current.clips, c]); setSel(c.id); setPanel('text'); };
  const importCaptions = async (f: File | undefined) => {
    if (!f) return; const cues = parseSrt(await f.text());
    if (!cues.length) { setMsg({ text: 'No subtitles were found in that file. Use an .srt or .vtt file.', error: true }); return; }
    commit([...dataRef.current.clips, ...cues.slice(0, 500).map((q) => makeClip({ id: uid(), kind: 'text', name: 'Caption', start: q.start, duration: q.end - q.start, track: 1, text: q.text.replace(/\n/g, ' '), fontSize: 44, color: '#ffffff', y: 0.36 }))]);
    setPanel(''); setMsg({ text: `${Math.min(cues.length, 500)} captions added.` });
  };
  const split = () => { const c = target(); if (!c) return; const r = splitClip(c, timeRef.current, uid()); if (r) { commit(dataRef.current.clips.flatMap((x) => (x.id === c.id ? r : [x]))); setSel(r[1].id); } else setMsg({ text: 'Move the playhead inside the clip to split it.' }); };
  const trim = (side: 'start' | 'end') => { const c = target(); if (!c) return; const r = side === 'start' ? trimStartTo(c, timeRef.current) : trimEndTo(c, timeRef.current); if (r) commit(dataRef.current.clips.map((x) => (x.id === c.id ? r : x))); else setMsg({ text: 'Move the playhead inside the clip first.' }); };
  const del = () => { const id = selRef.current; if (id) { commit(dataRef.current.clips.filter((c) => c.id !== id)); setSel(null); setPanel(''); } };
  const ripple = () => { const id = selRef.current; if (id) { commit(rippleDelete(dataRef.current.clips, id)); setSel(null); setPanel(''); } };
  const dup = () => { const c = selected(); if (c) { const n = { ...c, id: uid(), start: end(c) }; commit([...dataRef.current.clips, n]); setSel(n.id); } };
  const fillFrame = () => { const c = selected(); if (!c) return; const { iw, ih } = natural(getEl(c)); if (!iw || !ih) return; const { w, h } = canvasSize(dataRef.current.aspect, 720); update(c.id, { scale: fillScale(iw, ih, w, h), x: 0, y: 0 }); };
  const resetLook = () => { const c = selected(); if (c) update(c.id, { x: 0, y: 0, scale: 1, rotate: 0, flipX: false }); };
  const mutable = (): Clip | undefined => selected() ?? activeAt(dataRef.current.clips, timeRef.current).filter((x) => x.kind === 'video' || x.kind === 'audio').sort((a, b) => a.track - b.track)[0];
  const toggleMute = () => { const c = mutable(); if (!c) { setMsg({ text: 'There is no video or audio here to mute.' }); return; } if (c.kind === 'image' || c.kind === 'text') return; update(c.id, { volume: c.volume > 0 ? 0 : 1 }); };
  const setCoverNow = () => {
    const cv = document.createElement('canvas'); const { w, h } = canvasSize(dataRef.current.aspect, 720); const k = 360 / Math.max(w, h); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    syncMedia(timeRef.current, false); const big = document.createElement('canvas'); big.width = w; big.height = h; render(big.getContext('2d')!, w, h, timeRef.current); cv.getContext('2d')!.drawImage(big, 0, 0, cv.width, cv.height);
    setCover(cv.toDataURL('image/jpeg', 0.72)); setMsg({ text: 'Cover set to this frame.' });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
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
      else if (e.key === 'Escape') { if (panel || media) { setPanel(''); setMedia(''); } else setSel(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) ripple();
      else if (e.key === 'Delete' || e.key === 'Backspace') del();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // dragging on the timeline: move, trim, snap, change layer ---------------------------------
  const startDrag = (e: React.PointerEvent, c: Clip, mode: 'move' | 'l' | 'r', targetEl?: HTMLElement) => {
    e.stopPropagation(); setSel(c.id); const el = targetEl ?? e.currentTarget as HTMLElement; try { el.setPointerCapture(e.pointerId); } catch { /* pointer may have ended */ }
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
  const rulerTap = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left - pad) / zoom); };

  // tap and drag directly on the preview -----------------------------------------------------
  const hitTest = (px: number, py: number, rect: DOMRect): string | null => {
    const inside = (b: Box) => { const dx = (px - b.cx) * rect.width; const dy = (py - b.cy) * rect.height; const r = (-b.rot * Math.PI) / 180; const rx = dx * Math.cos(r) - dy * Math.sin(r); const ry = dx * Math.sin(r) + dy * Math.cos(r); return Math.abs(rx) <= (b.w * rect.width) / 2 && Math.abs(ry) <= (b.h * rect.height) / 2; };
    const mine = boxes.current.find((b) => b.id === selRef.current); if (mine && inside(mine)) return mine.id; // keep dragging the chosen clip when clips overlap
    for (let i = boxes.current.length - 1; i >= 0; i--) if (inside(boxes.current[i])) return boxes.current[i].id;
    return null;
  };
  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget; const rect = el.getBoundingClientRect();
    canvasPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const already = canvasPinch.current;
    if (canvasPts.current.size === 2) {
      const id = selRef.current; const clip = dataRef.current.clips.find((x) => x.id === id);
      if (clip && clip.kind !== 'audio') {
        const [a, b] = [...canvasPts.current.values()]; canvasPinch.current = { distance: Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)), scale: clip.scale, id: clip.id };
        e.preventDefault(); return;
      }
    }
    if (already) return;
    const id = hitTest((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, rect); setSel(id); if (!id) { setPanel(''); return; }
    const base = dataRef.current.clips.find((x) => x.id === id); if (!base) return; el.setPointerCapture(e.pointerId); const x0 = e.clientX; const y0 = e.clientY;
    const mv = (ev: PointerEvent) => {
      if (canvasPinch.current) return;
      let nx = base.x + (ev.clientX - x0) / rect.width; let ny = base.y + (ev.clientY - y0) / rect.height;
      if (snap) { if (Math.abs(nx) < 0.02) nx = 0; if (Math.abs(ny) < 0.02) ny = 0; }
      update(id, { x: nx, y: ny }, 'pos');
    };
    const up = (ev: PointerEvent) => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); canvasPts.current.delete(ev.pointerId); if (canvasPts.current.size < 2) canvasPinch.current = null; };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };
  const onCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasPts.current.has(e.pointerId)) return;
    canvasPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = canvasPinch.current; if (!p || canvasPts.current.size < 2) return;
    const [a, b] = [...canvasPts.current.values()]; const d = Math.max(1, Math.hypot(a.x-b.x, a.y-b.y));
    update(p.id, { scale: clamp(p.scale * d / p.distance, 0.1, 8) }, 'scale');
  };
  const onCanvasUp = (e: React.PointerEvent<HTMLCanvasElement>) => { canvasPts.current.delete(e.pointerId); if (canvasPts.current.size < 2) canvasPinch.current = null; };

  const pts = useRef(new Map<number, { x: number; y: number }>()); const pinch = useRef(0);
  const onTlDown = (ev: React.PointerEvent) => { if (playingRef.current) pause(); pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); pinch.current = 0; };
  const onTlMove = (ev: React.PointerEvent) => {
    if (!pts.current.has(ev.pointerId)) return; pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.current.size !== 2) return; const [a, b] = [...pts.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.current > 0) setZoom((z) => clamp((z * d) / pinch.current, 10, 300)); pinch.current = d;
  };
  const onTlUp = (ev: React.PointerEvent) => { pts.current.delete(ev.pointerId); pinch.current = 0; };

  const c = useMemo(() => data.clips.find((x) => x.id === sel), [data.clips, sel]);
  const isMedia = c?.kind === 'video' || c?.kind === 'audio';
  const sl = (label: string, key: keyof Clip, min: number, max: number, step = 0.01, show?: (v: number) => string) => c && <Slider label={label} value={Number(c[key] ?? (key === 'fadeIn' || key === 'fadeOut' ? 0 : 1))} min={min} max={max} step={step} show={show} onChange={(v) => update(c.id, { [key]: v } as Partial<Clip>, String(key))} />;
  const num = (label: string, key: 'start' | 'duration' | 'trimIn') => c && (
    <label className="cc-num">{label}<input type="number" step="0.1" min={0} value={Number(c[key].toFixed(2))} onChange={(e) => { const v = Math.max(key === 'duration' ? 0.2 : 0, Number(e.target.value)); update(c.id, { [key]: key === 'duration' ? Math.min(v, maxDuration(c)) : v } as Partial<Clip>, key); }} /><i>s</i></label>);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const freezeFrame = async () => {
    const c = target(); if (!c || c.kind !== 'video') { setMsg({ text: 'Select a video clip to freeze its current frame.' }); return; }
    const { w, h } = canvasSize(dataRef.current.aspect, 720); const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    render(cv.getContext('2d')!, w, h, timeRef.current);
    const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) { setMsg({ text: 'Could not capture the freeze frame.', error: true }); return; }
    const rec: MediaRecord = { id: uid(), projectId: project.id, kind: 'image', name: `Freeze ${clock(timeRef.current)}.png`, mime: 'image/png', size: blob.size, createdAt: Date.now(), blob };
    await putMedia(rec); mediaMap.current.set(rec.id, rec); await refreshAssets();
    const frozen = makeClip({ id: uid(), kind: 'image', name: rec.name, mediaId: rec.id, start: timeRef.current, duration: 2, track: c.track, scale: c.scale, x: c.x, y: c.y, rotate: c.rotate, opacity: c.opacity });
    commit([...dataRef.current.clips, frozen]); setSel(frozen.id); setMsg({ text: 'Freeze frame added for 2 seconds. Adjust its duration on the timeline.' });
  };

  // toolbars -----------------------------------------------------------------------------------
  const pick = (id: Panel) => () => setPanel(id);
  const mainTools: Tool[] = [
    { id: 'edit', icon: 'scissors', label: 'Edit', run: () => { const t = target(); if (t) setSel(t.id); else setMsg({ text: 'Add a photo or video first, then tap Edit.' }); } },
    { id: 'audio', icon: 'music', label: 'Audio', run: () => setMedia('audio') },
    { id: 'text', icon: 'text', label: 'Text', run: () => addText() },
    { id: 'fx', icon: 'star', label: 'Effects', run: () => { const t = target(); if (t) { setSel(t.id); setPanel('fx'); } else setMsg({ text: 'Add a photo or video first, then pick an effect.' }); } },
    { id: 'overlay', icon: 'overlay', label: 'Overlay', run: () => setMedia('overlay') },
    { id: 'captions', icon: 'captions', label: 'Captions', run: pick('captions') },
    { id: 'ratio', icon: 'ratio', label: 'Ratio', run: pick('ratio') },
  ];
  const clipTools = (): Tool[] => {
    if (!c) return [];
    const back: Tool = { id: 'back', icon: 'chevronLeft', label: 'Back', run: () => { setSel(null); setPanel(''); } };
    const common: Tool[] = [{ id: 'dup', icon: 'duplicate', label: 'Duplicate', run: dup }, { id: 'del', icon: 'trash', label: 'Delete', run: del, danger: true }, { id: 'ripple', icon: 'ripple', label: 'Ripple', run: ripple, off: c.kind === 'audio' }];
    const split_: Tool = { id: 'split', icon: 'scissors', label: 'Split', run: split };
    const trimS: Tool = { id: 'trims', icon: 'crop', label: 'Trim start', run: () => trim('start') }; const trimE: Tool = { id: 'trime', icon: 'crop', label: 'Trim end', run: () => trim('end') };
    const look: Tool[] = [{ id: 'fx', icon: 'star', label: 'Effects', run: pick('fx') }, { id: 'adjust', icon: 'sliders', label: 'Adjust', run: pick('adjust') }, { id: 'transform', icon: 'move', label: 'Position', run: pick('transform') }, { id: 'resize', icon: 'maximize', label: 'Resize', run: pick('transform') }, { id: 'flip', icon: 'flip', label: 'Flip', run: () => update(c.id, { flipX: !c.flipX }) }, { id: 'rot', icon: 'rotate', label: 'Rotate', run: () => update(c.id, { rotate: ((c.rotate + 90 + 180) % 360) - 180 }) }];
    const fade: Tool = { id: 'fade', icon: 'fade', label: 'Fade', run: pick('fade') };
    if (c.kind === 'text') return [back, { id: 'text', icon: 'text', label: 'Text', run: pick('text') }, { id: 'transform', icon: 'move', label: 'Position', run: pick('transform') }, { id: 'resize', icon: 'maximize', label: 'Resize', run: pick('transform') }, { id: 'length', icon: 'clock', label: 'Timing', run: pick('length') }, fade, split_, ...common];
    if (c.kind === 'image') return [back, split_, { id: 'length', icon: 'clock', label: 'Timing', run: pick('length') }, ...look, { id: 'fill', icon: 'maximize', label: 'Fill', run: fillFrame }, fade, ...common];
    if (c.kind === 'audio') return [back, split_, trimS, trimE, { id: 'volume', icon: c.volume > 0 ? 'volume' : 'mute', label: 'Volume', run: pick('volume') }, { id: 'speed', icon: 'gauge', label: 'Speed', run: pick('speed') }, fade, ...common];
    return [back, split_, trimS, trimE, { id: 'freeze', icon: 'camera', label: 'Freeze', run: freezeFrame }, { id: 'speed', icon: 'gauge', label: 'Speed', run: pick('speed') }, { id: 'volume', icon: c.volume > 0 ? 'volume' : 'mute', label: 'Volume', run: pick('volume') }, ...look, { id: 'fill', icon: 'maximize', label: 'Fill', run: fillFrame }, fade, ...common];
  };
  const tools = c ? clipTools() : mainTools;

  const sheetBody = () => {
    switch (panel) {
      case 'speed': return c && isMedia ? <><Slider label="Speed" value={speedOf(c)} min={0.25} max={4} step={0.05} show={(v) => `${v.toFixed(2)}×`} onChange={(v) => update(c.id, withSpeed(c, v), 'speed')} /><div className="cc-chips">{[0.5, 1, 1.5, 2, 3].map((v) => <button key={v} className={Math.abs(speedOf(c) - v) < 0.01 ? 'on' : ''} onClick={() => update(c.id, withSpeed(c, v))}>{v}×</button>)}</div></> : null;
      case 'volume': return c && isMedia ? <><Slider label="Volume" value={c.volume} min={0} max={1} show={pct} onChange={(v) => update(c.id, { volume: v }, 'volume')} /><div className="cc-chips"><button className={c.volume === 0 ? 'on' : ''} onClick={() => update(c.id, { volume: c.volume > 0 ? 0 : 1 })}>{c.volume === 0 ? 'Unmute' : 'Mute'}</button></div></> : null;
      case 'fade': return c ? <>{sl('Fade in', 'fadeIn', 0, 5, 0.1, (v) => `${v.toFixed(1)}s`)}{sl('Fade out', 'fadeOut', 0, 5, 0.1, (v) => `${v.toFixed(1)}s`)}</> : null;
      case 'adjust': return c && c.kind !== 'audio' ? <>{c.kind !== 'text' && <>{sl('Brightness', 'brightness', 0, 2, 0.01, pct)}{sl('Contrast', 'contrast', 0, 2, 0.01, pct)}{sl('Saturation', 'saturation', 0, 2, 0.01, pct)}</>}{sl('Opacity', 'opacity', 0, 1, 0.01, pct)}</> : null;
      case 'fx': return c && c.kind !== 'audio' && c.kind !== 'text' ? <div className="cc-fx" role="listbox" aria-label="Effects">{FX.map((f) => <button key={f.id} role="option" aria-selected={(c.fx ?? 'none') === f.id} className={(c.fx ?? 'none') === f.id ? 'on' : ''} onClick={() => update(c.id, { fx: f.id })}><span style={{ background: f.swatch }} /><em>{f.label}</em></button>)}</div> : <p className="muted small">Select a photo or video to give it a look.</p>;
      case 'transform': return c && c.kind !== 'audio' ? <>{sl('Size', 'scale', 0.1, 5, 0.01, (v) => `${Math.round(v * 100)}%`)}{sl('Rotate', 'rotate', -180, 180, 1, (v) => `${Math.round(v)}°`)}{sl('Left / right', 'x', -1, 1, 0.01, (v) => v.toFixed(2))}{sl('Up / down', 'y', -1, 1, 0.01, (v) => v.toFixed(2))}<div className="cc-chips">{c.kind !== 'text' && <button onClick={fillFrame}>Fill frame</button>}<button onClick={resetLook}>Reset</button><button className={c.flipX ? 'on' : ''} onClick={() => update(c.id, { flipX: !c.flipX })}>Flip</button></div></> : null;
      case 'length': return c ? <div className="cc-nums">{num('Start', 'start')}{num('Length', 'duration')}{isMedia ? num('Source offset', 'trimIn') : null}</div> : null;
      case 'text': return c && c.kind === 'text' ? <><label className="cc-text"><input value={c.text ?? ''} aria-label="Text" placeholder="Type your text" onChange={(e) => update(c.id, { text: e.target.value }, 'text')} /></label>{sl('Size', 'fontSize', 12, 200, 1, (v) => `${Math.round(v)}`)}<label className="cc-num">Colour<input type="color" value={c.color ?? '#ffffff'} onChange={(e) => update(c.id, { color: e.target.value }, 'color')} /></label></> : null;
      case 'captions': return <><div className="cc-chips"><button onClick={() => { addCaption(); }}>Add caption here</button><label className="cc-chip-file">Import .srt / .vtt<input type="file" hidden accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={(e) => { void importCaptions(e.target.files?.[0]); e.target.value = ''; }} /></label></div><p className="muted small">Captions are text clips under the picture. Drag them on the timeline to line them up.</p></>;
      case 'ratio': return <div className="cc-chips">{(['16:9', '9:16', '1:1'] as Aspect[]).map((a) => <button key={a} className={data.aspect === a ? 'on' : ''} onClick={() => setDataRaw({ ...data, aspect: a })}>{a}</button>)}</div>;
      case 'export': return (
        <div className="cc-export">
          <Select label="Format" value={exp.fmt} onChange={(v) => setExp({ ...exp, fmt: v })} options={[{ value: 'webm', label: 'WebM video' }, { value: 'png', label: 'PNG frame' }, { value: 'jpeg', label: 'JPEG frame' }]} />
          <Select label="Resolution" value={exp.res} onChange={(v) => setExp({ ...exp, res: v })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }]} />
          {exp.fmt === 'webm' && <Select label="Frame rate" value={exp.fps} onChange={(v) => setExp({ ...exp, fps: v })} options={[{ value: '24', label: '24 fps' }, { value: '30', label: '30 fps' }]} />}
          {exp.busy ? <><div className="meter"><div style={{ width: `${exp.pct}%` }} /></div><button className="btn" onClick={() => { cancelExport.current = true; }}>Cancel export</button></> : <button className="btn primary" disabled={data.clips.length === 0} onClick={exportNow}>Export</button>}
          <p className="muted small">Video export records the timeline in real time as WebM, so it takes as long as your video. Frame exports use the playhead position.</p>
        </div>);
      default: return null;
    }
  };

  // timeline rows, top to bottom: overlays and text that exist, the main track, audio, and an empty "Add text" row ----------
  const has = (tr: number) => data.clips.some((x) => x.track === tr);
  const rows: { track: number; h: number; ghost?: 'text' | 'audio' }[] = [
    ...(has(2) ? [{ track: 2, h: H_ROW }] : []), ...(has(1) ? [{ track: 1, h: H_ROW }] : []),
    { track: 0, h: H_MAIN }, { track: AUDIO_TRACK, h: H_ROW, ghost: has(AUDIO_TRACK) ? undefined : 'audio' },
    ...(has(1) ? [] : [{ track: 1, h: H_ROW, ghost: 'text' as const }]),
  ];
  const tickStep = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * zoom >= 56) ?? 600;
  const ticks = Array.from({ length: Math.floor(dur / tickStep) + 2 }, (_, i) => i * tickStep);
  const innerW = dur * zoom + pad * 2;
  const muted = (mutable()?.kind === 'video' || mutable()?.kind === 'audio') && (mutable() as Clip).volume === 0;

  return (
    <section className="cc">
      <header className="cc-top">
        <button className="cc-icon" aria-label="Close editor" onClick={() => { location.hash = '#/projects'; }}><Icon name="close" size={24} /></button>
        <span className="cc-name" title={project.name}>{project.name}<small role="status">{saved === 'saving' ? 'Saving…' : 'Saved'}</small></span>
        <Select label="Resolution" value={exp.res} onChange={(v) => setExp({ ...exp, res: v })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }]} />
        <button className="cc-export-btn" onClick={() => { pause(); setPanel('export'); }}>Export</button>
      </header>
      {msg && <div className={`cc-toast${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</div>}

      <div className="cc-stage" ref={stage}><canvas ref={canvas} className="cv" onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} aria-label="Preview. Tap a layer to select it, drag to move it." /></div>

      <div className="cc-ctl">
        <button className="cc-icon" aria-label="Full screen preview" onClick={fullscreen}><Icon name="maximize" size={22} /></button>
        <span className="cc-time" aria-label="Playhead time"><b>{clock(time)}</b> / {clock(dur)}</span>
        <span className="cc-grow" />
        <button className="cc-icon" aria-label="Previous cut" onClick={() => cut(-1)}><Icon name="skipBack" size={20} /></button>
        <button className="cc-play" aria-label={playing ? 'Pause' : 'Play'} onClick={play}><Icon name={playing ? 'pause' : 'play'} size={26} /></button>
        <button className="cc-icon" aria-label="Next cut" onClick={() => cut(1)}><Icon name="skipForward" size={20} /></button>
        <span className="cc-grow" />
        <button className={`cc-icon${snap ? ' on' : ''}`} aria-label={snap ? 'Snapping on' : 'Snapping off'} aria-pressed={snap} title="Snap to cuts and the playhead" onClick={() => setSnap(!snap)}><Icon name="magnet" size={21} /></button>
        <button className="cc-icon" aria-label="Undo" disabled={!past.current.length} onClick={undo}><Icon name="undo" size={21} /></button>
        <button className="cc-icon" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Icon name="redo" size={21} /></button><button className="cc-icon" aria-label="Zoom timeline out" onClick={() => setZoom((z) => clamp(z / 1.2, 10, 300))}>−</button><button className="cc-icon" aria-label="Zoom timeline in" onClick={() => setZoom((z) => clamp(z * 1.2, 10, 300))}>＋</button><button className="cc-icon" aria-label="Expand timeline" onClick={() => setTimelineHeight((h) => clamp(h + 60, 180, 430))}>↕</button><button className="cc-icon" aria-label="Shrink timeline" onClick={() => setTimelineHeight((h) => clamp(h - 60, 180, 430))}>↕</button>
      </div>

      <div className="cc-tl" style={{ height: timelineHeight }}>
        <div ref={tlScroll} className="cc-scroll" onScroll={onTlScroll} onPointerDown={onTlDown} onPointerMove={onTlMove} onPointerUp={onTlUp} onPointerCancel={onTlUp} onWheel={(ev) => { if (playingRef.current) pause(); if (ev.ctrlKey) { ev.preventDefault(); setZoom((z) => clamp(z * (ev.deltaY < 0 ? 1.1 : 0.9), 10, 300)); } }}>
          <div className="cc-inner" style={{ width: innerW }}>
            <div className="ruler" style={{ height: H_RULER }} onClick={rulerTap}>{ticks.map((t) => <span key={t} style={{ left: pad + t * zoom }}>{clock(t)}</span>)}{ticks.map((t) => <i key={`d${t}`} style={{ left: pad + (t + tickStep / 2) * zoom }} />)}</div>
            {rows.map((r) => (
              <div key={`${r.track}${r.ghost ?? ''}`} ref={(el) => { if (el && !r.ghost) rowEls.current.set(r.track, el); else if (!r.ghost) rowEls.current.delete(r.track); }} className="trow" style={{ height: r.h }} onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
                {r.ghost && <button className="cc-ghost" style={{ left: pad, width: Math.max(dur * zoom, 220) }} onClick={() => (r.ghost === 'audio' ? setMedia('audio') : addText())}><Icon name="plus" size={16} />{r.ghost === 'audio' ? 'Add audio' : 'Add text'}</button>}
                {data.clips.filter((x) => x.track === r.track).map((x) => {
                  const th = x.mediaId && x.kind !== 'audio' && x.kind !== 'text' ? thumbs[x.mediaId] : undefined; const pk = x.kind === 'audio' && x.mediaId ? peaks[x.mediaId] : undefined; const sp = speedOf(x); const on = x.id === sel;
                  return (
                    <div key={x.id} className={`clip ${x.kind}${on ? ' sel' : ''}${th ? ' has-thumb' : ''}${r.track === 0 ? ' main' : ''}`} style={{ left: pad + x.start * zoom, width: Math.max(10, x.duration * zoom), ...(th ? { backgroundImage: `url(${th})` } : {}) }}
                      onPointerDown={(e) => { if (e.pointerType === 'mouse' || on) startDrag(e, x, 'move'); else { setSel(x.id); const target = e.currentTarget; const ev = e; longPress.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => startDrag(ev, x, 'move', target), 420) }; } }} onPointerMove={(e) => { const lp = longPress.current; if (lp && Math.hypot(e.clientX-lp.x, e.clientY-lp.y) > 9) { clearTimeout(lp.timer); longPress.current = null; } }} onPointerUp={() => { if (longPress.current) { clearTimeout(longPress.current.timer); longPress.current = null; } }} onPointerCancel={() => { if (longPress.current) { clearTimeout(longPress.current.timer); longPress.current = null; } }} onClick={() => setSel(x.id)} role="button" tabIndex={0} aria-label={`${x.name}, ${x.kind} clip`} aria-pressed={on} onKeyDown={(e) => { if (e.key === 'Enter') setSel(x.id); }}>
                      {pk && <Wave peaks={pk.p} a={Math.round(clamp(x.trimIn / pk.d, 0, 1) * 1000) / 1000} b={Math.round(clamp((x.trimIn + x.duration * sp) / pk.d, 0, 1) * 1000) / 1000} />}
                      {on && <i className="h l" onPointerDown={(e) => startDrag(e, x, 'l')} />}<span>{x.kind === 'text' ? x.text : x.kind === 'video' || x.kind === 'audio' ? `${x.volume === 0 ? '🔇 ' : ''}${sp !== 1 ? `${Number(sp.toFixed(2))}× ` : ''}${x.kind === 'audio' ? x.name : ''}` : ''}</span>{on && <i className="h r" onPointerDown={(e) => startDrag(e, x, 'r')} />}
                    </div>);
                })}
                {r.track === 0 && <button className="cc-add" style={{ left: pad + mainEnd() * zoom + 10 }} aria-label="Add media" onClick={() => setMedia('visual')}><Icon name="plus" size={24} /></button>}
              </div>))}
        <div className="cc-rail" aria-hidden={false}>
          <div style={{ height: H_RULER }} />
          {rows.map((r) => (
            <div key={`${r.track}${r.ghost ?? ''}`} className="cc-rail-row" style={{ height: r.h }}>
              {r.track === 0 && <><button className="cc-rail-btn" onClick={toggleMute}><Icon name={muted ? 'mute' : 'volume'} size={20} /><span>{muted ? 'Unmute' : 'Mute clip'}</span></button><button className="cc-rail-btn" onClick={setCoverNow}><Icon name="cover" size={20} /><span>Cover</span></button></>}
              {r.track === AUDIO_TRACK && <button className="cc-rail-mini" aria-label="Add audio" onClick={() => setMedia('audio')}><Icon name="music" size={16} /></button>}
              {r.track === 1 && <button className="cc-rail-mini" aria-label="Add text" onClick={() => addText()}><Icon name="text" size={16} /></button>}
            </div>))}
        </div>

            {guide !== null && <div className="guide" style={{ left: pad + guide * zoom }} />}
          </div>
        </div>
        <div className="cc-playhead" />
        {data.clips.length === 0 && <p className="cc-hint muted small">Tap + to add photos or videos</p>}
      </div>

      {media ? <MediaSheet mode={media} items={[...assets, ...lib]} onClose={() => setMedia('')} onImport={(f) => void importAndAdd(f, media)} onPick={(r) => { const m = media; setMedia(''); void addAsset(r, m); }} />
        : panel ? (
          <div className="cc-sheet" role="dialog" aria-label={TITLES[panel]}>
            <div className="cc-sheet-head"><strong>{TITLES[panel]}</strong><button className="cc-icon" aria-label="Done" onClick={() => setPanel('')}><Icon name="check" size={24} /></button></div>
            <div className="cc-sheet-body">{sheetBody()}</div>
          </div>
        ) : (
          <nav className="cc-tools" aria-label="Editing tools">
            {tools.map((t) => <button key={t.id} className={`cc-tool${t.danger ? ' danger' : ''}${t.on ? ' on' : ''}`} disabled={t.off} onClick={t.run}><Icon name={t.icon} size={22} /><span>{t.label}</span></button>)}
          </nav>
        )}
    </section>
  );
}
