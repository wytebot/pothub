import { Icon } from './Icon';
import type { WebSource } from '../agent/research';

/** Consolidated source drawer at the end of a reply. */
export function Sources({ sources }: { sources?: WebSource[] }) {
  if (!sources?.length) return null;
  return (
    <details className="web-sources-drawer">
      <summary className="web-sources-button"><Icon name="globe" size={14} /> SOURCES <span className="source-count">{sources.length}</span></summary>
      <div className="web-sources-list" aria-label="Sources used in this answer">
        {sources.map((s) => <a key={s.host} className="web-source" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}><Icon name="globe" size={14} /><span><strong>{s.host}</strong><small>{s.title}</small></span><span aria-hidden="true">↗</span></a>)}
      </div>
    </details>
  );
}
