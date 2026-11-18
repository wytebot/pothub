import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createProject, deleteProject, duplicateProject, listProjects, renameProject, type ProjectRecord } from '../storage/db';
import { exportProject, importProject } from '../storage/zip';
import { platform } from '../platform';
import { Select } from '../ui/Select';
import { Menu } from '../ui/Menu';
import { Dialog } from '../ui/Dialog';

type Sort = 'recent' | 'name';
type Dlg = { kind: 'rename' | 'delete'; p: ProjectRecord } | null;
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function Projects() {
  const [items, setItems] = useState<ProjectRecord[] | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const [dlg, setDlg] = useState<Dlg>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean; extra?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setItems(await listProjects()), []);
  useEffect(() => { refresh().catch(() => setMsg({ text: 'Projects could not be read. Check that this browser allows site storage.', error: true })); }, [refresh]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    try { const ok = await fn(); setMsg(ok ? { text: ok } : null); await refresh(); }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Something went wrong. Try again.', error: true }); }
    finally { setBusy(false); }
  };

  const sorted = useMemo(() => (items ? [...items].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt)) : null), [items, sort]);

  const onExport = (p: ProjectRecord) => run(async () => {
    const { blob, fileName } = await exportProject(p.id);
    return (await platform.saveFile(blob, fileName)) === 'saved' ? `Exported "${p.name}".` : undefined;
  });
  const onImport = (f: File) => run(async () => {
    const { project, warnings } = await importProject(f);
    if (warnings.length) setTimeout(() => setMsg({ text: `Imported "${project.name}" with ${warnings.length} problem(s).`, extra: warnings }), 0);
    return `Imported "${project.name}".`;
  });

  return (
    <section className="page">
      <header className="page-head">
        <h1>Projects</h1>
        <div className="row">
          <Select<Sort> label="Sort projects" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Last edited' }, { value: 'name', label: 'Name' }]} />
          <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Import ZIP</button>
          <button className="btn primary" disabled={busy} onClick={() => run(async () => { await createProject(); })}>New project</button>
          <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onImport(f); }} />
        </div>
      </header>

      {msg && (
        <div className={`notice${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>
          {msg.text}
          {msg.extra && <ul>{msg.extra.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}

      {sorted === null ? <p className="muted">Loading…</p> : sorted.length === 0 ? (
        <div className="panel empty"><p>No projects yet.</p><p className="muted">Create a project, or import a ZIP you exported earlier. Projects live only on this device.</p></div>
      ) : (
        <ul className="list">
          {sorted.map((p) => (
            <li key={p.id} className="item">
              <div className="thumb" aria-hidden="true">{typeof p.data.cover === 'string' ? <img src={p.data.cover} alt="" /> : p.name.slice(0, 1).toUpperCase()}</div>
              <div className="grow"><div className="title">{p.name}</div><div className="muted small">Edited {when(p.updatedAt)}</div></div>
              <Menu label={`Actions for ${p.name}`} disabled={busy} items={[
                { label: 'Open in editor', onSelect: () => { location.hash = `/editor/${p.id}`; } },
                { label: 'Rename', onSelect: () => { setName(p.name); setDlg({ kind: 'rename', p }); } },
                { label: 'Duplicate', onSelect: () => void run(async () => { await duplicateProject(p.id); return `Duplicated "${p.name}".`; }) },
                { label: 'Export ZIP', onSelect: () => void onExport(p) },
                { label: 'Delete', danger: true, onSelect: () => setDlg({ kind: 'delete', p }) },
              ]} />
            </li>
          ))}
        </ul>
      )}

      {dlg?.kind === 'rename' && (
        <Dialog title="Rename project" onClose={() => setDlg(null)} actions={<>
          <button className="btn" onClick={() => setDlg(null)}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => { const d = dlg; setDlg(null); void run(async () => { await renameProject(d.p.id, name.trim()); }); }}>Save name</button>
        </>}>
          <label className="field">Project name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { const d = dlg; setDlg(null); void run(async () => { await renameProject(d.p.id, name.trim()); }); } }} /></label>
        </Dialog>
      )}
      {dlg?.kind === 'delete' && (
        <Dialog title="Delete project?" onClose={() => setDlg(null)} actions={<>
          <button className="btn" onClick={() => setDlg(null)}>Keep project</button>
          <button className="btn danger" onClick={() => { const d = dlg; setDlg(null); void run(async () => { await deleteProject(d.p.id); return `Deleted "${d.p.name}".`; }); }}>Delete project</button>
        </>}>
          <p>"{dlg.p.name}" and all its media will be removed from this device. There is no cloud copy, so this cannot be undone. Export it first if you want to keep it.</p>
        </Dialog>
      )}
    </section>
  );
}
