import { Icon } from './Icon';
import type { WebSource } from '../agent/research';

/** Compact source strip: actual site favicons, with an expandable page list. */
export function Sources({ sources }: { sources?: WebSource[] }) {
  if (!sources?.length) return null;
  const favicon = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  return (
    <details className="web-sources-drawer">
      <summary className="web-sources-button" aria-label={`Show ${sources.length} researched source pages`}>
        <span className="source-favicon-strip" aria-hidden="true">
          {sources.slice(0, 3).map((s) => <img key={s.url} src={favicon(s.host)} alt="" loading="lazy" />)}
        </span>
        <span>Sources</span><span className="source-count">{sources.length}</span><Icon name="chevron-down" size={14}/>
      </summary>
      <div className="web-sources-list" aria-label="Pages searched and used in this answer">
        {sources.map((s, i) => <a key={s.url} className="web-source-row" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
          <span className="source-index">{i + 1}</span><img src={favicon(s.host)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="web-source-copy"><strong>{s.title || s.host}</strong><small>{s.host}</small></span><Icon name="external-link" size={14}/>
        </a>)}
      </div>
    </details>
  );
}
