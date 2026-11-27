import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useOutside } from './useOutside';
import { listRepos, loadGithubToken, type Repo } from '../repo/github';
import type { Tag, TagMode } from '../repo/tags';

let cache: { at: number; repos: Repo[] } | null = null;
const FRESH = 5 * 60_000;

/** The list that opens when "@" is typed in the MonyGist chat composer. Repositories stay tagged in the composer until the user removes or replaces them. */
export function RepoPicker({ query, tags, onToggle, onClose }: { query: string; tags: Tag[]; onToggle: (repo: string, mode: TagMode) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [repos, setRepos] = useState<Repo[]>(cache?.repos ?? []);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>(cache ? 'ready' : 'loading');
  const [error, setError] = useState('');
  useOutside(box, true, onClose);
  useEffect(() => {
    let live = true;
    if (cache && Date.now() - cache.at < FRESH) return;
    (async () => {
      const token = await loadGithubToken();
      if (!token) { if (live) setState('none'); return; }
      try { const r = await listRepos(token); cache = { at: Date.now(), repos: r }; if (live) { setRepos(r); setState('ready'); } }
      catch (e) { if (live) { setError(e instanceof Error ? e.message : 'Could not load repositories.'); setState('error'); } }
    })();
    return () => { live = false; };
  }, []);
  const shown = useMemo(() => { const q = query.toLowerCase(); return repos.filter((r) => r.full_name.toLowerCase().includes(q)); }, [repos, query]);
  const mode = (repo: string) => tags.find((t) => t.repo === repo)?.mode;

  return (
    <div className="rp-pop" ref={box} role="dialog" aria-label="Choose repositories">
      <div className="rp-head"><span><Icon name="git-branch" size={15} /> Repositories</span><span className="rp-cols"><b>Tag</b></span></div>
      <div className="rp-list" role="group">
        {state === 'loading' && <p className="rp-empty">Loading…</p>}
        {state === 'none' && <p className="rp-empty">Connect GitHub first. <a href="#/codelab" onClick={onClose}>Open Codelab</a></p>}
        {state === 'error' && <p className="rp-empty">{error}</p>}
        {state === 'ready' && !shown.length && <p className="rp-empty">No repository matches “{query}”.</p>}
        {shown.map((r) => (
          <div className="rp-row" key={r.id}>
            <span className="rp-name"><Icon name="folder" size={15} /><span>{r.full_name}</span>{r.private && <i>private</i>}</span>
            <button type="button" role="checkbox" aria-checked={!!mode(r.full_name)} aria-label={`Tag repository: ${r.full_name}`} className={`rp-box${mode(r.full_name) ? ' on' : ''}`} onClick={() => onToggle(r.full_name, 'keep')}>{mode(r.full_name) && <Icon name="check" size={14} />}</button>
          </div>
        ))}
      </div>
      <button type="button" className="rp-done" onClick={onClose}>Done</button>
    </div>
  );
}

/** The tags shown in the composer. */
export function TagRow({ tags, onRemove }: { tags: Tag[]; onRemove: (repo: string) => void }) {
  if (!tags.length) return null;
  return (
    <div className="attach-row rp-tags" aria-label="Tagged repositories">
      {tags.map((t) => (
        <span className={`rp-tag ${t.mode}`} key={t.repo} title='Stays tagged until you remove it'>
          <b>@</b>{t.repo}<i>active</i>
          <button type="button" aria-label={`Remove ${t.repo}`} onClick={() => onRemove(t.repo)}><Icon name="close" size={13} /></button>
        </span>
      ))}
    </div>
  );
}
