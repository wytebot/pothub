import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, listLibrary, listMedia, putBundle, putMedia, uid, type MediaRecord, type ProjectRecord, listProjects } from '../storage/db';
import { activeAt, AUDIO_TRACK, canvasSize, end, fadeFactor, makeClip, splitClip, totalDuration, type Aspect, type Clip, type TimelineData } from '../editor/model';
import { platform } from '../platform';
import { Select } from '../ui/Select';

const ROWS = [{ track: 2, label: 'Layer 3' }, { track: 1, label: 'Layer 2' }, { track: 0, label: 'Layer 1' }, { track: AUDIO_TRACK, label: 'Audio' }];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
type El = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

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
  const [assets, setAssets] = useState<MediaRecord[]>([]);
  const [lib, setLib] = useState<MediaRecord[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [exp, setExp] = useState<{ fmt: 'webm' | 'png' | 'jpeg'; res: '720' | '1080'; fps: '24' | '30'; busy: boolean; pct: number }>({ fmt: 'webm', res: '720', fps: '30', busy: false, pct: 0 });

  const dataRef = useRef(data); dataRef.current = data;
  const timeRef = useRef(0); const past = useRef<Clip[][]>([]); const future = useRef<Clip[][]>([]); const lastKey = useRef({ k: '', t: 0 });
  const canvas = useRef<HTMLCanvasElement>(null); const els = useRef(new Map<string, El>()); const urls = useRef(new Map<string, string>());
  const mediaMap = useRef(new Map<string, MediaRecord>()); const raf = useRef(0); const cancelExport = useRef(false);
  const audio = useRef<{ ac: AudioContext; dest: MediaStreamAudioDestinationNode; mon: GainNode; srcs: Map<El, MediaElementAudioSourceNode> } | null>(null);
  const dur = totalDuration(data.clips);

  const refreshAssets = useCallback(async () => { const a = await listMedia(project.id); mediaMap.current = new Map(a.map((m) => [m.id, m])); setAssets(a); setLib((await listLibrary())); }, [project.id]);
  useEffect(() => { void refreshAssets(); return () => { cancelAnimationFrame(raf.current); els.current.forEach((e) => { if (e instanceof HTMLMediaElement) e.pause(); }); urls.current.forEach(URL.revokeObjectURL); void audio.current?.ac.close(); }; }, [refreshAssets]);

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
  useEffect(() => { const t = setTimeout(() => { void putBundle({ ...project, data: { ...project.data, aspect: data.aspect, clips: data.clips }, updatedAt: Date.now() }, []).catch((e) => setMsg({ text: e instanceof Error ? e.message : 'Autosave failed.', error: true })); }, 600); return () => clearTimeout(t); }, [data, project]);

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

  const render = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const vis = activeAt(dataRef.current.clips, t).filter((c) => c.kind !== 'audio').sort((a, b) => a.track - b.track);
    for (const c of vis) {
      ctx.save(); ctx.globalAlpha = c.opacity * fadeFactor(c, t);
      ctx.translate(w / 2 + c.x * w, h / 2 + c.y * h); ctx.rotate((c.rotate * Math.PI) / 180); ctx.scale(c.flipX ? -1 : 1, 1);
      if (c.kind === 'text') { ctx.font = `600 ${((c.fontSize ?? 48) * h) / 720}px system-ui, sans-serif`; ctx.fillStyle = c.color ?? '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.scale(c.scale, c.scale); ctx.fillText(c.text ?? '', 0, 0); }
      else {
        const e = getEl(c); const iw = e instanceof HTMLVideoElement ? e.videoWidth : e instanceof HTMLImageElement ? e.naturalWidth : 0; const ih = e instanceof HTMLVideoElement ? e.videoHeight : e instanceof HTMLImageElement ? e.naturalHeight : 0;
        if (e && iw && ih) { const s = Math.min(w / iw, h / ih) * c.scale; ctx.filter = `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation})`; ctx.drawImage(e as CanvasImageSource, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s); }
      }
      ctx.restore();
    }
  };
  const draw = () => { const cv = canvas.current; if (!cv) return; const { w, h } = canvasSize(dataRef.current.aspect, 720); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } render(cv.getContext('2d')!, w, h, timeRef.current); };

  const syncMedia = (t: number, playingNow: boolean) => {
    for (const c of dataRef.current.clips) {
      if (c.kind !== 'video' && c.kind !== 'audio') continue;
      const e = getEl(c) as HTMLMediaElement | null; if (!e) continue;
      const on = t >= c.start && t < end(c);
      if (!on) { if (!e.paused) e.pause(); continue; }
      const target = c.trimIn + (t - c.start);
      if (!playingNow || Math.abs(e.currentTime - target) > 0.35) e.currentTime = target;
      e.volume = clamp(c.volume * fadeFactor(c, t), 0, 1);
      if (playingNow && e.paused) void e.play().catch(() => {}); else if (!playingNow && !e.paused) e.pause();
    }
  };
  useEffect(() => { if (!playing) { timeRef.current = time; syncMedia(time, false); draw(); } }); // eslint-disable-line

  // playback + export ----------------------------------------------------------
  const run = (from: number, onFrame: (t: number) => void, onEnd: () => void) => {
    const t0 = performance.now(); const stop = totalDuration(dataRef.current.clips);
    const tick = () => { const t = from + (performance.now() - t0) / 1000; if (t >= stop || cancelExport.current) { onEnd(); return; } timeRef.current = t; setTime(t); syncMedia(t, true); draw(); onFrame(t); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  const pause = () => { cancelAnimationFrame(raf.current); setPlaying(false); syncMedia(timeRef.current, false); };
  const play = () => { if (playing) { pause(); return; } const from = timeRef.current >= dur - 0.05 ? 0 : timeRef.current; setPlaying(true); cancelExport.current = false; run(from, () => {}, () => { setTime(Math.min(timeRef.current, dur)); pause(); }); };
  const seek = (t: number) => { if (playing) pause(); const v = clamp(t, 0, dur); timeRef.current = v; setTime(v); };

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
  const addAsset = async (rec: MediaRecord) => {
    let r = rec;
    if (rec.projectId !== project.id) { r = { ...rec, id: uid(), projectId: project.id }; await putMedia(r); await refreshAssets(); mediaMap.current.set(r.id, r); }
    const d = r.kind === 'image' ? 5 : await probe(r.blob, r.kind as 'video' | 'audio');
    const c = makeClip({ id: uid(), kind: r.kind, name: r.name, mediaId: r.id, start: time, duration: d, srcDuration: r.kind === 'image' ? undefined : d });
    commit([...dataRef.current.clips, c]); setSel(c.id);
  };
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    try { for (const f of Array.from(files)) { const kind = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null; if (!kind) continue; await putMedia({ id: uid(), projectId: project.id, kind, name: f.name, mime: f.type, size: f.size, createdAt: Date.now(), blob: f }); } await refreshAssets(); }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Import failed.', error: true }); }
  };
  const addText = () => { const c = makeClip({ id: uid(), kind: 'text', name: 'Text', start: time, duration: 3, track: 1, text: 'Your text', fontSize: 64, color: '#ffffff' }); commit([...data.clips, c]); setSel(c.id); };
  const split = () => { const c = data.clips.find((x) => x.id === sel); if (!c) return; const r = splitClip(c, time, uid()); if (r) { commit(data.clips.flatMap((x) => (x.id === c.id ? r : [x]))); setSel(r[1].id); } };
  const del = () => { if (sel) { commit(data.clips.filter((c) => c.id !== sel)); setSel(null); } };
  const dup = () => { const c = data.clips.find((x) => x.id === sel); if (c) { const n = { ...c, id: uid(), start: end(c) }; commit([...data.clips, n]); setSel(n.id); } };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (['INPUT', 'TEXTAREA'].includes(tag)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); play(); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (!mod && e.key.toLowerCase() === 's') split();
      else if (!mod && e.key.toLowerCase() === 'd') dup();
      else if (e.key === 'Delete' || e.key === 'Backspace') del();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // timeline drag --------------------------------------------------------------------
  const startDrag = (e: React.PointerEvent, c: Clip, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation(); setSel(c.id); const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
    const x0 = e.clientX; const base = dataRef.current.clips; const snap = c; let moved = false;
    const mv = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / zoom; moved = true; let n: Clip = snap;
      if (mode === 'move') n = { ...snap, start: Math.max(0, snap.start + dt) };
      else if (mode === 'r') { const max = snap.srcDuration ? snap.srcDuration - snap.trimIn : Infinity; n = { ...snap, duration: clamp(snap.duration + dt, 0.2, max) }; }
      else { const d = clamp(dt, -Math.min(snap.start, snap.trimIn), snap.duration - 0.2); n = { ...snap, start: snap.start + d, trimIn: snap.trimIn + d, duration: snap.duration - d }; }
      setDataRaw({ ...dataRef.current, clips: base.map((x) => (x.id === c.id ? n : x)) });
    };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); if (moved) { past.current.push(base); future.current = []; } };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };
  const rulerSeek = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); const go = (x: number) => seek((x - r.left) / zoom); go(e.clientX); const el = e.currentTarget; el.setPointerCapture(e.pointerId); const mv = (ev: PointerEvent) => go(ev.clientX); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); };

  const pts = useRef(new Map<number, { x: number; y: number }>()); const pinch = useRef(0);
  const onTlDown = (ev: React.PointerEvent) => { pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); pinch.current = 0; };
  const onTlMove = (ev: React.PointerEvent) => {
    if (!pts.current.has(ev.pointerId)) return; pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.current.size !== 2) return; const [a, b] = [...pts.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.current > 0) setZoom((z) => clamp((z * d) / pinch.current, 10, 300)); pinch.current = d;
  };
  const onTlUp = (ev: React.PointerEvent) => { pts.current.delete(ev.pointerId); pinch.current = 0; };
  const c = useMemo(() => data.clips.find((x) => x.id === sel), [data.clips, sel]);
  const slider = (label: string, key: keyof Clip, min: number, max: number, step = 0.01) => c && (
    <label className="field">{label} <span className="muted">{Number(c[key]).toFixed(2)}</span>
      <input type="range" min={min} max={max} step={step} value={Number(c[key])} onChange={(e) => update(c.id, { [key]: Number(e.target.value) } as Partial<Clip>, String(key))} /></label>);
  const num = (label: string, key: 'start' | 'duration' | 'trimIn') => c && (
    <label className="field">{label} (s)<input type="number" step="0.1" min={0} value={Number(c[key].toFixed(2))} onChange={(e) => update(c.id, { [key]: Math.max(key === 'duration' ? 0.2 : 0, Number(e.target.value)) } as Partial<Clip>, key)} /></label>);

  return (
    <section className="editor">
      <header className="ed-bar">
        <a className="small" href="#/projects">Projects</a><strong className="grow title">{project.name}</strong>
        <Select<Aspect> label="Canvas shape" value={data.aspect} onChange={(a) => setDataRaw({ ...data, aspect: a })} options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
      </header>
      {msg && <div className={`notice${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</div>}
      <div className="ed-main">
        <aside className="ed-side panel">
          <h2>Media</h2>
          <label className="btn file">Import files<input type="file" multiple hidden accept="image/*,video/*,audio/*" onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} /></label>
          <ul className="list flush assets">{assets.map((a) => <li key={a.id} className="item"><span className="grow title small">{a.name}</span><button className="btn sm" onClick={() => addAsset(a)}>Add</button></li>)}</ul>
          {lib.length > 0 && <><h2>Generated</h2><ul className="list flush assets">{lib.map((a) => <li key={a.id} className="item"><span className="grow title small">{a.name}</span><button className="btn sm" onClick={() => addAsset(a)}>Add</button></li>)}</ul></>}
          {assets.length + lib.length === 0 && <p className="muted small">Import media or generate some in the studios.</p>}
        </aside>
        <div className="ed-center">
          <div className="stage"><canvas ref={canvas} className="cv" style={{ aspectRatio: data.aspect.replace(':', '/') }} /></div>
          <div className="row ed-tools">
            <button className="btn" onClick={play}>{playing ? 'Pause' : 'Play'}</button>
            <span className="muted small">{fmt(time)} / {fmt(dur)}</span>
            <button className="btn" disabled={!past.current.length} onClick={undo}>Undo</button>
            <button className="btn" disabled={!future.current.length} onClick={redo}>Redo</button>
            <button className="btn" disabled={!c} onClick={split}>Split</button>
            <button className="btn" disabled={!c} onClick={dup}>Duplicate</button>
            <button className="btn" disabled={!c} onClick={del}>Delete</button>
            <button className="btn" onClick={addText}>Add text</button>
            <button className="btn" onClick={() => setZoom((z) => clamp(z / 1.4, 10, 300))}>Zoom out</button>
            <button className="btn" onClick={() => setZoom((z) => clamp(z * 1.4, 10, 300))}>Zoom in</button>
          </div>
        </div>
        <aside className="ed-side panel">
          <h2>{c ? 'Properties' : 'Export'}</h2>
          {c ? (<div className="stack">
            {num('Start', 'start')}{num('Length', 'duration')}{c.kind === 'video' || c.kind === 'audio' ? num('Source offset', 'trimIn') : null}
            {c.kind !== 'audio' && <>{slider('Opacity', 'opacity', 0, 1)}{slider('Scale', 'scale', 0.1, 3)}{slider('Rotate', 'rotate', -180, 180, 1)}{slider('Position X', 'x', -1, 1)}{slider('Position Y', 'y', -1, 1)}
              {c.kind !== 'text' && <>{slider('Brightness', 'brightness', 0, 2)}{slider('Contrast', 'contrast', 0, 2)}{slider('Saturation', 'saturation', 0, 2)}</>}
              <button className="btn" onClick={() => update(c.id, { flipX: !c.flipX })}>{c.flipX ? 'Unflip' : 'Flip horizontally'}</button>
              <Select label="Layer" value={String(c.track)} onChange={(v) => update(c.id, { track: Number(v) })} options={[{ value: '0', label: 'Layer 1 (back)' }, { value: '1', label: 'Layer 2' }, { value: '2', label: 'Layer 3 (front)' }]} /></>}
            {c.kind === 'text' && <><label className="field">Text<input value={c.text ?? ''} onChange={(e) => update(c.id, { text: e.target.value }, 'text')} /></label>{slider('Size', 'fontSize', 12, 200, 1)}<label className="field">Colour<input type="color" value={c.color ?? '#ffffff'} onChange={(e) => update(c.id, { color: e.target.value }, 'color')} /></label></>}
            {(c.kind === 'video' || c.kind === 'audio') && slider('Volume', 'volume', 0, 1)}
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
      <div className="tl panel">
        <div className="tl-scroll" onPointerDown={onTlDown} onPointerMove={onTlMove} onPointerUp={onTlUp} onPointerCancel={onTlUp} onWheel={(ev) => { if (ev.ctrlKey) { ev.preventDefault(); setZoom((z) => clamp(z * (ev.deltaY < 0 ? 1.1 : 0.9), 10, 300)); } }}>
          <div className="tl-inner" style={{ width: dur * zoom + 120 }}>
            <div className="ruler" onPointerDown={rulerSeek}>{Array.from({ length: Math.ceil(dur) + 1 }, (_, i) => <span key={i} style={{ left: i * zoom }}>{zoom >= 30 || i % 5 === 0 ? i : ''}</span>)}</div>
            {ROWS.map((r) => (
              <div key={r.track} className="trow" onPointerDown={() => setSel(null)}>
                <span className="tlabel">{r.label}</span>
                {data.clips.filter((x) => x.track === r.track).map((x) => (
                  <div key={x.id} className={`clip ${x.kind}${x.id === sel ? ' sel' : ''}`} style={{ left: x.start * zoom, width: Math.max(8, x.duration * zoom) }} onPointerDown={(e) => startDrag(e, x, 'move')} role="button" tabIndex={0} aria-label={`${x.name}, ${x.kind} clip`}>
                    <i className="h l" onPointerDown={(e) => startDrag(e, x, 'l')} /><span>{x.kind === 'text' ? x.text : x.name}</span><i className="h r" onPointerDown={(e) => startDrag(e, x, 'r')} />
                  </div>))}
              </div>))}
            <div className="playhead" style={{ left: time * zoom }} />
          </div>
        </div>
        <p className="muted small">Space plays, S splits, D duplicates, Delete removes, Ctrl+Z undoes. Drag clips to move them, drag their edges to trim, pinch or Ctrl+scroll the timeline to zoom.</p>
      </div>
    </section>
  );
}
