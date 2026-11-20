import { useEffect, useState } from 'react';
import { unlock, lock, isUnlocked } from '../vault/auth';
import { addKey, defaultKeys, getSecret, isDefaultFor, listKeys, removeKey, setDefault, setStatus, storageKind, updateKey, type KeyMeta, type ProviderId } from '../vault/vault';
import { testKey } from '../models/providers';
import { FNS, FN_LABEL, PROVIDERS, PROVIDER_IDS, fieldsOf, fnsOf, joinSecret, splitSecret } from '../models/providerInfo';
import { dropCatalogCache } from '../agent/detect';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';

const badge: Record<KeyMeta['status'], string> = { untested: 'Not tested', ok: 'Connected', invalid: 'Rejected', error: 'Check failed' };
const caps = (p: ProviderId) => PROVIDERS[p].text ? 'Text & coding' : '';


/** One dialog for both adding a key and editing a saved one. */
interface Editor { provider: ProviderId; label: string; edit?: KeyMeta; /** edit only: the saved secret has every box, so an empty box keeps its saved value */ complete?: boolean; }

export function Providers() {
  const [open, setOpen] = useState(isUnlocked());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [keys, setKeys] = useState<KeyMeta[]>(listKeys());
  const [dlg, setDlg] = useState<Editor | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<KeyMeta | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const [q, setQ] = useState('');
  const refresh = () => { dropCatalogCache(); setKeys(listKeys()); };
  const close = () => { setVals({}); setDlg(null); setErr(''); };

  useEffect(() => () => { setVals({}); }, []);

  const doUnlock = async () => {
    setErr(''); const r = await unlock();
    if (r.ok) { setOpen(true); setNote(r.note ?? ''); } else setErr(r.reason);
  };
  const startAdd = (provider: ProviderId) => { setErr(''); setVals({}); setDlg({ provider, label: '' }); };
  const startEdit = async (k: KeyMeta) => {
    setErr(''); setVals({}); let complete = false;
    try { complete = splitSecret(k.provider, await getSecret(k.id)).length === fieldsOf(k.provider).length; } catch { /* nothing readable: ask for every box */ }
    setDlg({ provider: k.provider, label: k.label, edit: k, complete });
  };
  const save = async () => {
    if (!dlg) return; setErr('');
    const entered = fieldsOf(dlg.provider).map((f) => (vals[f.id] ?? '').trim());
    try {
      if (!dlg.edit) await addKey(dlg.provider, dlg.label, joinSecret(dlg.provider, entered));
      else {
        let secret: string | undefined;
        if (entered.some(Boolean)) {
          const old = dlg.complete ? splitSecret(dlg.provider, await getSecret(dlg.edit.id)) : [];
          secret = joinSecret(dlg.provider, entered.map((v, i) => v || old[i] || ''));
        }
        await updateKey(dlg.edit.id, { label: dlg.label, secret });
      }
      close(); refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'The key could not be saved.'); }
  };
  const test = async (k: KeyMeta) => {
    setBusy(k.id); setMsg(null);
    try { const r = await testKey(k.provider, await getSecret(k.id)); setStatus(k.id, r.status); setMsg({ id: k.id, text: r.message, error: r.status !== 'ok' }); }
    catch (e) { setMsg({ id: k.id, text: e instanceof Error ? e.message : 'Test failed.', error: true }); }
    finally { setBusy(''); refresh(); }
  };

  if (!open) return (
    <section className="page">
      <h1>AI Providers</h1>
      <div className="panel">
        <h2>Locked</h2>
        <p>Confirm with your fingerprint or device lock to manage your API keys.</p>
        {err && <p className="error-text" role="alert">{err}</p>}
        <button className="btn primary" onClick={doUnlock}>Unlock</button>
      </div>
    </section>
  );

  const connected = PROVIDER_IDS.filter((p) => keys.some((k) => k.provider === p));
  const rest = PROVIDER_IDS.filter((p) => !connected.includes(p) && PROVIDERS[p].name.toLowerCase().includes(q.trim().toLowerCase()));
  const fields = dlg ? fieldsOf(dlg.provider) : [];
  const canSave = !!dlg && (dlg.edit ? dlg.label.trim() !== dlg.edit.label || fields.some((f) => (vals[f.id] ?? '').trim()) : fields.every((f) => (vals[f.id] ?? '').trim()));

  return (
    <section className="page">
      <header className="page-head">
        <h1>AI Providers</h1>
        <div className="row">
          <button className="btn" disabled={!!busy || keys.length === 0} onClick={async () => { for (const k of keys) await test(k); }}>Test all</button>
          <button className="btn" onClick={() => { lock(); setOpen(false); }}>Lock now</button>
          <button className="btn primary" onClick={() => startAdd(connected[0] ?? 'openai')}>Add key</button>
        </div>
      </header>
      {note && <div className="notice warn" role="note">{note}</div>}
      <div className="notice" role="note">
        Pothub is text-only BYOK. Media generation and editing have been removed. API usage is billed by your provider. Your keys are kept in {storageKind()} and are never shown again after saving. Anyone with full access to your unlocked device could still reach them, so use keys with spending limits.
      </div>

      {keys.length > 0 && (
        <div className="panel stack">
          <h2>Default routing</h2>
          {FNS.map((f) => { const chain = defaultKeys(f); return (
            <p className="small" key={f}><strong>{FN_LABEL[f]}:</strong> {chain.length ? chain.map((k) => `${PROVIDERS[k.provider].name} (${k.label})`).join(' → ') : <span className="error-text">no default key, so this is switched off</span>}</p>
          ); })}
          <p className="muted small">Pothub only uses keys ticked as a default, for the functions you ticked. If one fails (rejected key, no credit, rate limit), it moves to the next default for that function, in the order shown.</p>
        </div>
      )}

      {connected.map((p) => {
        const mine = keys.filter((k) => k.provider === p);
        return (
          <div className="panel" key={p}>
            <h2>{PROVIDERS[p].name}{PROVIDERS[p].beta && <span className="chip beta">Beta</span>}</h2>
            <p className="muted small">{caps(p)} · {PROVIDERS[p].billing}</p>
            <ul className="list flush">
              {mine.map((k) => (
                <li key={k.id} className="item wrap">
                  <div className="grow"><div className="title">{k.label}</div><div className="muted small">•••• {k.last4}</div></div>
                  <span className={`chip ${k.status}`}>{badge[k.status]}</span>
                  <button className="btn" disabled={busy === k.id} onClick={() => test(k)}>{busy === k.id ? 'Testing…' : 'Test'}</button>
                  <button className="btn" onClick={() => startEdit(k)}>Edit</button>
                  <button className="btn" onClick={() => setRemoving(k)}>Remove</button>
                  <div className="full row wrap small">
                    <span className="muted">Default for:</span>
                    {fnsOf(k.provider).map((f) => (
                      <label className="check" key={f}><input type="checkbox" checked={isDefaultFor(k, f)} onChange={(e) => { setDefault(k.id, f, e.target.checked); refresh(); }} /> {FN_LABEL[f]}</label>
                    ))}
                  </div>
                  {msg?.id === k.id && <div className={`full small ${msg.error ? 'error-text' : 'muted'}`} role="status">{msg.text}</div>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="panel stack">
        <h2>{connected.length ? 'More providers' : 'Choose a provider'}</h2>
        <input type="search" placeholder="Search providers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search providers" />
        <ul className="list flush">
          {rest.map((p) => (
            <li key={p} className="item wrap">
              <div className="grow">
                <div className="title">{PROVIDERS[p].name}{PROVIDERS[p].beta && <span className="chip beta">Beta</span>}</div>
                <div className="muted small">{caps(p)} · key from {PROVIDERS[p].keyFrom}</div>
              </div>
              <button className="btn" onClick={() => startAdd(p)}>Add key</button>
            </li>
          ))}
          {rest.length === 0 && <li className="item muted small">No providers match.</li>}
        </ul>
        <p className="muted small">Beta providers were added recently. If one fails, press Test on its key and check the message.</p>
      </div>

      {dlg && (
        <Dialog title={dlg.edit ? `Edit ${PROVIDERS[dlg.provider].name} key` : 'Add key'} onClose={close} actions={<>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={!canSave} onClick={save}>{dlg.edit ? 'Save changes' : 'Save key'}</button>
        </>}>
          {!dlg.edit && <Select<ProviderId> label="Provider" value={dlg.provider} onChange={(v) => { setVals({}); setDlg({ ...dlg, provider: v }); }} options={PROVIDER_IDS.map((v) => ({ value: v, label: PROVIDERS[v].name }))} />}
          <label className="field">Name<input value={dlg.label} maxLength={40} placeholder="Personal key" onChange={(e) => setDlg({ ...dlg, label: e.target.value })} /></label>
          {fields.map((f) => (
            <label className="field" key={f.id}>{f.label}<input type="password" autoComplete="off" spellCheck={false} value={vals[f.id] ?? ''} placeholder={dlg.edit && dlg.complete ? 'Leave empty to keep the saved value' : ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} /></label>
          ))}
          {dlg.edit && !dlg.complete && fields.length > 1 && <p className="small error-text">This key was saved without all of its values. Enter every box below.</p>}
          {dlg.edit && (dlg.complete || fields.length === 1) && <p className="muted small">Saved secrets are never shown. Fill a box only to replace it. Your default ticks stay as they are.</p>}
          <p className="muted small">{PROVIDERS[dlg.provider].keyHint ?? `Get a key from ${PROVIDERS[dlg.provider].keyFrom}.`}</p>
          {err && <p className="error-text" role="alert">{err}</p>}
        </Dialog>
      )}
      {removing && (
        <Dialog title="Remove key?" onClose={() => setRemoving(null)} actions={<>
          <button className="btn" onClick={() => setRemoving(null)}>Keep key</button>
          <button className="btn danger" onClick={async () => { const k = removing; setRemoving(null); await removeKey(k.id); refresh(); }}>Remove key</button>
        </>}>
          <p>"{removing.label}" (•••• {removing.last4}) will be deleted from this device. It stays active with your provider until you revoke it there.</p>
        </Dialog>
      )}
    </section>
  );
}
