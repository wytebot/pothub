import React from 'react';
import { Check, ExternalLink, Plus, X } from 'lucide-react';
import { ALL_TARGETS, placeholdersFor, rowProblem } from '../../lib/vercel-env.js';
import ReauthNotice from './ReauthNotice.jsx';

const cap = (t) => t[0].toUpperCase() + t.slice(1);

/**
 * Name / value rows with a Sensitive or Not sensitive choice. Names and values start empty; the faded text is only a hint.
 * Saved rows collapse to grey chips so the form stays short while more variables are added.
 */
export default function EnvEditor({ draft, dashboardUrl, onReauthorize, hideSave = false }) {
  const { rows, targets, busy, error, reauth, attempted, update, add, remove, toggle, save, pending, saved } = draft;
  const pendingList = rows.filter((r) => !r.saved);
  return (
    <div className="vx-env">
      <div className="vx-env-head">
        <h3>Environment variables</h3>
        <a href={dashboardUrl} target="_blank" rel="noreferrer">Open in Vercel <ExternalLink size={13} aria-hidden="true" /></a>
      </div>

      {saved.length > 0 && (
        <ul className="vx-saved" aria-label="Saved variables">
          {saved.map((r) => (
            <li key={r.id} className="vx-saved-chip"><Check size={14} aria-hidden="true" /><span>{r.key}</span><small>{r.sensitive ? 'Sensitive' : 'Not sensitive'}</small></li>
          ))}
        </ul>
      )}

      {pendingList.map((row, i) => {
        const problem = (attempted || row.touched) ? rowProblem(row, rows) : '';
        const hint = placeholdersFor(saved.length + i);
        return (
          <div className="vx-row" key={row.id}>
            <div className="vx-row-fields">
              <input value={row.key} onChange={(e) => update(row.id, { key: e.target.value.replace(/\s/g, '') })} onBlur={() => update(row.id, { touched: true })} placeholder={hint.name} aria-label="Variable name" autoCapitalize="characters" autoCorrect="off" spellCheck="false" autoComplete="off" />
              <input value={row.value} onChange={(e) => update(row.id, { value: e.target.value })} onBlur={() => update(row.id, { touched: true })} placeholder={hint.value} aria-label="Variable value" type={row.sensitive ? 'password' : 'text'} autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete={row.sensitive ? 'new-password' : 'off'} />
              {(pendingList.length > 1 || row.key || row.value) && <button type="button" className="vx-icon-btn" aria-label="Remove this variable" onClick={() => remove(row.id)}><X size={16} /></button>}
            </div>
            <div className="vx-kind" role="group" aria-label="Variable type">
              <label className={row.sensitive ? 'on' : ''}><input type="checkbox" checked={row.sensitive} onChange={() => update(row.id, { sensitive: true })} />Sensitive</label>
              <label className={!row.sensitive ? 'on' : ''}><input type="checkbox" checked={!row.sensitive} onChange={() => update(row.id, { sensitive: false })} />Not sensitive</label>
            </div>
            {problem && <p className="vx-field-error" role="alert">{problem}</p>}
          </div>
        );
      })}

      <div className="vx-env-actions">
        <button type="button" className="secondary vx-add" onClick={add}><Plus size={16} aria-hidden="true" /> Add variable</button>
        {!hideSave && <button type="button" className="primary" onClick={save} disabled={busy || pending === 0}>{busy ? 'Saving…' : pending > 1 ? `Save ${pending} variables` : 'Save variable'}</button>}
      </div>

      <div className="vx-targets" role="group" aria-label="Environments">
        <span>Applies to</span>
        {ALL_TARGETS.map((t) => <button type="button" key={t} className={`vx-pill${targets.includes(t) ? ' on' : ''}`} aria-pressed={targets.includes(t)} onClick={() => toggle(t)}>{cap(t)}</button>)}
      </div>

      {reauth ? <ReauthNotice onReauthorize={onReauthorize} /> : error && <p className="vx-field-error" role="alert">{error}</p>}
    </div>
  );
}
