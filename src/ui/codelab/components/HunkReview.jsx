import { useMemo, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { diffHunks, applySelectedHunks } from '../diff-hunks';

export default function HunkReview({ title = 'Review proposed changes', original, proposed, onApply, onClose }) {
  const hunks = useMemo(() => diffHunks(original, proposed), [original, proposed]);
  const [decisions, setDecisions] = useState(() => new Map());
  const accepted = new Set([...decisions].filter(([, v]) => v === 'accept').map(([k]) => k));
  const decide = (id, value) => setDecisions(old => new Map(old).set(id, value));
  const apply = () => { try { onApply(applySelectedHunks(original, hunks, accepted)); } catch (e) { window.alert(e.message || 'Could not apply the reviewed changes.'); } };
  if (!hunks.length) return <section className="hunkReview" role="dialog" aria-modal="true" aria-label={title}><header><strong>{title}</strong><button onClick={onClose} aria-label="Close diff review"><X size={16}/></button></header><p>No differences to review.</p><button onClick={onClose}>Close</button></section>;
  return <section className="hunkReview" role="dialog" aria-modal="true" aria-label={title}>
    <header><strong>{title}</strong><button onClick={onClose} aria-label="Close diff review"><X size={16}/></button></header>
    <p className="muted">Nothing is applied until you select Accept and choose Apply accepted hunks. Rejected or undecided hunks stay unchanged.</p>
    <div className="hunkList">{hunks.map((h, idx) => <article className="hunkCard" key={h.id}>
      <div className="hunkHead"><b>Hunk {idx + 1}</b><span>line {h.start + 1}{h.oversized ? ' · large-file fallback' : ''}</span><div><button className={decisions.get(h.id)==='accept'?'active':''} onClick={()=>decide(h.id,'accept')}><Check size={14}/> Accept</button><button className={decisions.get(h.id)==='reject'?'active':''} onClick={()=>decide(h.id,'reject')}><X size={14}/> Reject</button></div></div>
      <pre>{h.lines ? h.lines.map((line, i) => `${line.type==='insert'?'+':line.type==='delete'?'-':' '} ${line.text}`).join('\n') : `- ${h.before.join('\n- ')}\n+ ${h.after.join('\n+ ')}`}</pre>
    </article>)}</div>
    <footer><span>{accepted.size} accepted · {decisions.size - accepted.size} rejected/undecided</span><button onClick={()=>setDecisions(new Map())}><RotateCcw size={14}/> Reset</button><button onClick={onClose}>Cancel</button><button className="primary" disabled={!accepted.size} onClick={apply}>Apply accepted hunks</button></footer>
  </section>;
}
