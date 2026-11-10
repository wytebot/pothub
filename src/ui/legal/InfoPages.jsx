import React from 'react';
import { X, Mail } from 'lucide-react';
import { INFO_PAGES, INFO_ORDER, INFO_LABELS, CONTACT_EMAIL, CONTACT_HREF, LAST_UPDATED } from './content.js';

const linkify = (text) => String(text).split(CONTACT_EMAIL).flatMap((part, i, arr) => (i < arr.length - 1 ? [part, <a key={i} href={CONTACT_HREF}>{CONTACT_EMAIL}</a>] : [part]));

/** How-it-works guide and legal pages. Renders inside the app (section) or as a modal (welcome screen) and as plain Next pages. */
export default function InfoPages({ page = 'how', onNavigate, onClose, modal = false, standalone = false }) {
  const id = INFO_PAGES[page] ? page : 'how';
  const doc = INFO_PAGES[id];
  const body = (
    <article className="info-page" aria-labelledby="info-title">
      <header>
        <h1 id="info-title">{doc.title}</h1>
        <p className="info-intro">{linkify(doc.intro)}</p>
      </header>
      <nav className="info-tabs" aria-label="Help and legal pages">
        {INFO_ORDER.map((k) => (standalone
          ? <a key={k} href={k === 'how' ? '/how-it-works' : k === 'aup' ? '/acceptable-use' : k === 'data' ? '/data-deletion' : `/${k}`} className={k === id ? 'active' : ''} aria-current={k === id ? 'page' : undefined}>{INFO_LABELS[k]}</a>
          : <button key={k} type="button" className={k === id ? 'active' : ''} aria-current={k === id ? 'page' : undefined} onClick={() => onNavigate?.(k)}>{INFO_LABELS[k]}</button>))}
      </nav>
      {doc.sections.map((s) => (
        <section key={s.h} className="info-section">
          <h2>{s.h}</h2>
          {s.p?.map((t, i) => <p key={i}>{linkify(t)}</p>)}
          {s.steps && <ol>{s.steps.map((t, i) => <li key={i}>{linkify(t)}</li>)}</ol>}
          {s.ul && <ul>{s.ul.map((t, i) => <li key={i}>{linkify(t)}</li>)}</ul>}
        </section>
      ))}
      <footer className="info-footer">
        <a className="info-mail" href={CONTACT_HREF}><Mail size={16} aria-hidden="true" /> {CONTACT_EMAIL}</a>
        <small>Last updated {LAST_UPDATED}</small>
      </footer>
    </article>
  );
  if (modal) {
    return (
      <div className="info-modal" role="dialog" aria-modal="true" aria-label={doc.title}>
        <div className="info-modal-bar"><strong>{doc.title}</strong><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X /></button></div>
        <div className="info-modal-body">{body}</div>
      </div>
    );
  }
  return <div className={standalone ? 'info-standalone' : 'info-inline'}>{body}</div>;
}
