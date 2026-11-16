import { LEGAL_DOCS, LEGAL_EFFECTIVE, LEGAL_VERSION } from '../legal/docs';

export function Legal({ id }: { id?: string }) {
  const doc = LEGAL_DOCS.find((d) => d.id === id);
  if (!doc) return (
    <section className="page">
      <h1>Legal documents</h1>
      <p className="muted small">Version {LEGAL_VERSION}, effective {LEGAL_EFFECTIVE}. These documents should be reviewed by a lawyer for the places you operate in before public launch.</p>
      <ul className="list">{LEGAL_DOCS.map((d) => <li key={d.id} className="item"><a className="title grow" href={`#/legal/${d.id}`}>{d.title}</a></li>)}</ul>
    </section>
  );
  return (
    <section className="page doc">
      <a className="small" href="#/legal">All legal documents</a>
      <h1>{doc.title}</h1>
      <p className="muted small">Version {LEGAL_VERSION}, effective {LEGAL_EFFECTIVE}</p>
      {doc.sections.map(([h, t]) => <div key={h}><h2>{h}</h2><p>{t}</p></div>)}
    </section>
  );
}
