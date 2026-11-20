import { Icon } from './Icon';
import type { WebSource } from '../agent/research';

/** The sites a web-researched answer drew on, each inside a web icon, at the very end of the reply. Renders nothing when web results were not used. */
export function Sources({ sources }: { sources?: WebSource[] }) {
  if (!sources?.length) return null;
  return (
    <nav className="web-sources" aria-label="Web sources">
      {sources.map((s) => (
        <a key={s.host} className="web-source" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title} aria-label={`Open ${s.host}`}>
          <Icon name="globe" size={14} /><span>{s.host}</span>
        </a>
      ))}
    </nav>
  );
}
