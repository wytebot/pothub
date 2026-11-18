import { useEffect, useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { listLibrary, listProjects, type MediaRecord, type ProjectRecord } from '../storage/db';
import { sendToEditor } from '../storage/toEditor';

const GLYPH = { image: '', video: '▶', audio: '♪' } as const;

/**
 * "Pick media to edit": choose any generated or attached photos, videos and audio, choose a new or existing project,
 * and open them together in the Creative Editor.
 */
export function MediaPicker({ extra = [], preselect = [], onClose }: { /** media that is not in the library yet (files attached in the chat) */ extra?: MediaRecord[]; preselect?: string[]; onClose: () => void }) {
  const [lib, setLib] = useState<MediaRecord[] | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set(preselect));
  const [target, setTarget] = useState('new');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { void listLibrary().then(setLib).catch(() => setLib([])); void listProjects().then(setProjects).catch(() => {}); }, []);
  const items = useMemo(() => { const seen = new Set<string>(); return [...extra, ...(lib ?? [])].filter((m) => (m.kind === 'image' || m.kind === 'video' || m.kind === 'audio') && !seen.has(m.id) && seen.add(m.id)); }, [extra, lib]);
  const urls = useMemo(() => new Map(items.filter((m) => m.kind !== 'audio').map((m) => [m.id, URL.createObjectURL(m.blob)])), [items]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const open = async () => {
    setBusy(true); setErr('');
    try { const id = await sendToEditor(items.filter((m) => chosen.has(m.id)), target); onClose(); location.hash = `#/editor/${id}`; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the editor. Try again.'); setBusy(false); }
  };
  return (
    <Dialog title="Pick media to edit" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!chosen.size || busy} onClick={() => void open()}>{busy ? 'Opening…' : `Open in Editor${chosen.size ? ` (${chosen.size})` : ''}`}</button></>}>
      {lib === null ? <p className="muted small">Loading your media…</p> : items.length === 0 ? <p className="muted small">Nothing to edit yet. Generate an image or video, or attach media with the + button.</p> : (
        <div className="pick-grid" role="group" aria-label="Media to edit">
          {items.map((m) => (
            <button key={m.id} type="button" className={`pick-tile${chosen.has(m.id) ? ' on' : ''}`} aria-pressed={chosen.has(m.id)} onClick={() => toggle(m.id)} title={m.name}>
              {m.kind === 'image' ? <img src={urls.get(m.id)} alt="" /> : m.kind === 'video' ? <video src={`${urls.get(m.id)}#t=0.1`} muted playsInline preload="metadata" /> : <span className="pick-audio" aria-hidden="true">{GLYPH.audio}</span>}
              {m.kind === 'video' && <span className="pick-badge" aria-hidden="true">{GLYPH.video}</span>}
              <span className="pick-check" aria-hidden="true">{chosen.has(m.id) ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
      <label className="pick-target">Open in
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="new">A new project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {err && <p className="error-text" role="alert">{err}</p>}
    </Dialog>
  );
}
