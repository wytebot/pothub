import React from 'react';

/** Social-app style suggestion list shown above the composer while typing @… in a repository chat. */
export default function RepoMentionPicker({ items, index, onPick, onHover }) {
  const activeRef = React.useRef(null);
  React.useEffect(() => { activeRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [index]);
  return (
    <ul className="mention-list" role="listbox" aria-label="Files in this repository">
      {items.map((item, i) => (
        <li key={item.path} role="option" aria-selected={i === index} ref={i === index ? activeRef : null}
          className={`mention-item${i === index ? ' active' : ''}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(item)} onMouseEnter={() => onHover(i)}>
          <span className="mention-name">{item.name}</span>
          {item.dir && <span className="mention-dir">{item.dir}</span>}
        </li>
      ))}
    </ul>
  );
}
