import { useState } from 'react';
import { unlock, lock, isUnlocked } from '../vault/auth';
import { addKey, getSecret, listKeys, removeKey, setDefaultKey, setStatus, storageKind, updateKey, type KeyMeta, type ProviderId } from '../vault/vault';
import { testKey } from '../models/providers';
import { PROVIDERS, PROVIDER_IDS } from '../models/providerInfo';
import { IMAGE_MODELS, VIDEO_MODELS } from '../models/registry';
import { dropCatalogCache } from '../agent/detect';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';

const badge: Record<KeyMeta['status'], string> = { untested: 'Not tested', ok: 'Connected', invalid: 'Rejected', error: 'Check failed' };
const caps = (p: ProviderId) => [PROVIDERS[p].image && 'Images', PROVIDERS[p].video && 'Video'].filter(Boolean).join(' · ');
const modelNames = (p: ProviderId) => [...IMAGE_MODELS, ...VIDEO_MODELS].filter((m) => m.provider === p).map((m) => m.name);

export function Providers() {
  const [open, setOpen] = useState(isUnlocked());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [keys, setKeys] = useState<KeyMeta[]>(listKeys());
  const [adding, setAdding] = useState<{ provider: ProviderId; label: string } | null>(null);
  const [editing, setEditing] = useState<KeyMeta | null>(null);
  const [secret, setSecret] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [removing, setRemoving] = useState<KeyMeta | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const [q, setQ] = useState('');
  const refresh = () => { dropCatalogCache(); setKeys(listKeys()); };
  const clearFields = () => { setSecret(''); setAccessKey(''); setSecretKey(''); setErr(''); };


  const doUnlock = async () => {
    setErr(''); const r = await unlock();
    if (r.ok) { setOpen(true); setNote(r.note ?? ''); } else setErr(r.reason);
  };
  const save = async () => {
    if (!adding) return; setErr('');
    try {
      const value = adding.provider === 'kling' ? `${accessKey.trim()}:${secretKey.trim()}` : secret.trim();
      await addKey(adding.provider, adding.label, value);
      clearFields(); setAdding(null); refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'The key could not be saved.'); }
  };
  const beginEdit = (k: KeyMeta) => { clearFields(); setEditing(k); setEditLabel(k.label); };
  const saveEdit = async () => {
    if (!editing) return; setErr('');
    try {
      let replacement: string | undefined;
      if (editing.provider === 'kling' && (accessKey.trim() || secretKey.trim())) {
        const current = (await getSecret(editing.id)).split(':');
        const access = accessKey.trim() || current[0] || '';
        const secretPart = secretKey.trim() || current[1] || '';
        replacement = `${access}:${secretPart}`;
      } else if (editing.provider !== 'kling' && secret.trim()) replacement = secret.trim();
      await updateKey(editing.id, editLabel, replacement);
      clearFields(); setEditing(null); refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'The credential could not be updated.'); }
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
  const startAdd = (provider: ProviderId) => { clearFields(); setAdding({ provider, label: '' }); };
  const editorProvider = adding?.provider ?? editing?.provider;

  return (
    <section className="page">
      <header className="page-head">
        <h1>AI Providers</h1>
        <div className="row">
          <button className="btn" disabled={!!busy || !keys.some((k) => k.isDefault)} onClick={async () => { for (const k of keys.filter((x) => x.isDefault)) await test(k); }}>Test defaults</button>
          <button className="btn" onClick={() => { lock(); setOpen(false); }}>Lock now</button>
          <button className="btn primary" onClick={() => startAdd(connected[0] ?? 'openai')}>Add key</button>
        </div>
      </header>
      {note && <div className="notice warn" role="note">{note}</div>}
      <div className="notice" role="note">
        You pay each provider directly for what you generate. Your keys are kept in {storageKind()} and are never shown again after saving. Anyone with full access to your unlocked device could still reach them, so use keys with spending limits. Only a key marked Default is used for generation. If it fails, Pothub tries another provider's selected default only when that provider supports the requested image or video task; it never silently uses a non-default key.
      </div>

      {connected.map((p) => {
        const mine = keys.filter((k) => k.provider === p);
        return (
          <div className="panel" key={p}>
            <h2>{PROVIDERS[p].name}{PROVIDERS[p].beta && <span className="chip beta">Beta</span>}</h2>
            <p className="muted small">{caps(p)} · {PROVIDERS[p].billing}</p>
            <p className="muted small">Models: {modelNames(p).join(', ')}</p>
            <ul className="list flush">
              {mine.map((k) => (
                <li key={k.id} className="item wrap">
                  <div className="grow"><div className="title">{k.label}</div><div className="muted small">•••• {k.last4}</div></div>
                  <span className={`chip ${k.status}`}>{badge[k.status]}</span>
                  <label className="check"><input type="checkbox" checked={!!k.isDefault} onChange={(e) => { setDefaultKey(k.id, e.target.checked); refresh(); }} /> Default</label>
                  <button className="btn" disabled={busy === k.id} onClick={() => test(k)}>{busy === k.id ? 'Testing…' : 'Test'}</button>
                  <button className="btn" onClick={() => beginEdit(k)}>Edit</button>
                  <button className="btn" onClick={() => setRemoving(k)}>Remove</button>
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

      {adding && editorProvider && (
        <Dialog title="Add provider credentials" onClose={() => { clearFields(); setAdding(null); }} actions={<>
          <button className="btn" onClick={() => { clearFields(); setAdding(null); }}>Cancel</button>
          <button className="btn primary" disabled={adding.provider === 'kling' ? !accessKey.trim() || !secretKey.trim() : !secret.trim()} onClick={save}>Save credentials</button>
        </>}>
          <Select<ProviderId> label="Provider" value={adding.provider} onChange={(v) => { clearFields(); setAdding({ ...adding, provider: v }); }} options={PROVIDER_IDS.map((v) => ({ value: v, label: PROVIDERS[v].name }))} />
          <label className="field">Name<input value={adding.label} maxLength={40} placeholder="Personal key" onChange={(e) => setAdding({ ...adding, label: e.target.value })} /></label>
          {adding.provider === 'kling' ? <>
            <label className="field">Kling Access Key<input autoComplete="off" spellCheck={false} value={accessKey} onChange={(e) => setAccessKey(e.target.value)} /></label>
            <label className="field">Kling Secret Key<input type="password" autoComplete="off" spellCheck={false} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} /></label>
            <p className="muted small">Both values are required. Pothub signs Kling requests using these two credentials.</p>
          </> : <>
            <label className="field">API key<input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
            <p className="muted small">{PROVIDERS[adding.provider].keyHint ?? `Get a key from ${PROVIDERS[adding.provider].keyFrom}.`}</p>
          </>}
          {err && <p className="error-text" role="alert">{err}</p>}
        </Dialog>
      )}
      {editing && (
        <Dialog title={`Edit ${PROVIDERS[editing.provider].name} credentials`} onClose={() => { clearFields(); setEditing(null); }} actions={<>
          <button className="btn" onClick={() => { clearFields(); setEditing(null); }}>Cancel</button>
          <button className="btn primary" onClick={saveEdit}>Save changes</button>
        </>}>
          <label className="field">Name<input value={editLabel} maxLength={40} placeholder="Personal key" onChange={(e) => setEditLabel(e.target.value)} /></label>
          {editing.provider === 'kling' ? <>
            <label className="field">New Access Key<input autoComplete="off" spellCheck={false} value={accessKey} placeholder="Leave blank to keep current" onChange={(e) => setAccessKey(e.target.value)} /></label>
            <label className="field">New Secret Key<input type="password" autoComplete="off" spellCheck={false} value={secretKey} placeholder="Leave blank to keep current" onChange={(e) => setSecretKey(e.target.value)} /></label>
            <p className="muted small">Leave either field blank to keep that saved value. Values are never revealed in this editor.</p>
          </> : <>
            <label className="field">New API key<input type="password" autoComplete="off" spellCheck={false} value={secret} placeholder="Leave blank to keep current" onChange={(e) => setSecret(e.target.value)} /></label>
            <p className="muted small">Leave blank to keep the saved key. Values are never revealed in this editor.</p>
          </>}
          {err && <p className="error-text" role="alert">{err}</p>}
        </Dialog>
      )}
      {removing && (
        <Dialog title="Remove credentials?" onClose={() => setRemoving(null)} actions={<>
          <button className="btn" onClick={() => setRemoving(null)}>Keep credentials</button>
          <button className="btn danger" onClick={async () => { const k = removing; setRemoving(null); await removeKey(k.id); refresh(); }}>Remove</button>
        </>}>
          <p>"{removing.label}" (•••• {removing.last4}) will be deleted from this device. It stays active with your provider until you revoke it there. If it was the default, this provider will have no active default until you choose another saved key.</p>
        </Dialog>
      )}
    </section>
  );
}
