import { useEffect, useState } from 'react';
import { unlock, lock, isUnlocked } from '../vault/auth';
import { addKey, getSecret, listKeys, removeKey, setStatus, storageKind, type KeyMeta, type ProviderId } from '../vault/vault';
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
  const [adding, setAdding] = useState<{ provider: ProviderId; label: string; replace?: KeyMeta } | null>(null);
  const [secret, setSecret] = useState('');
  const [removing, setRemoving] = useState<KeyMeta | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const [q, setQ] = useState('');
  const refresh = () => { dropCatalogCache(); setKeys(listKeys()); };

  useEffect(() => () => { setSecret(''); }, []);

  const doUnlock = async () => {
    setErr(''); const r = await unlock();
    if (r.ok) { setOpen(true); setNote(r.note ?? ''); } else setErr(r.reason);
  };
  const save = async () => {
    if (!adding) return; setErr('');
    try {
      await addKey(adding.provider, adding.label, secret);
      if (adding.replace) await removeKey(adding.replace.id);
      setSecret(''); setAdding(null); refresh();
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
  const startAdd = (provider: ProviderId) => { setErr(''); setSecret(''); setAdding({ provider, label: '' }); };

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
        You pay each provider directly for what you generate. Your keys are kept in {storageKind()} and are never shown again after saving. Anyone with full access to your unlocked device could still reach them, so use keys with spending limits.
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
                  <button className="btn" disabled={busy === k.id} onClick={() => test(k)}>{busy === k.id ? 'Testing…' : 'Test'}</button>
                  <button className="btn" onClick={() => { setErr(''); setSecret(''); setAdding({ provider: k.provider, label: k.label, replace: k }); }}>Replace</button>
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

      {adding && (
        <Dialog title={adding.replace ? 'Replace key' : 'Add key'} onClose={() => { setSecret(''); setAdding(null); }} actions={<>
          <button className="btn" onClick={() => { setSecret(''); setAdding(null); }}>Cancel</button>
          <button className="btn primary" disabled={!secret.trim()} onClick={save}>Save key</button>
        </>}>
          {!adding.replace && <Select<ProviderId> label="Provider" value={adding.provider} onChange={(v) => setAdding({ ...adding, provider: v })} options={PROVIDER_IDS.map((v) => ({ value: v, label: PROVIDERS[v].name }))} />}
          <label className="field">Name<input value={adding.label} maxLength={40} placeholder="Personal key" onChange={(e) => setAdding({ ...adding, label: e.target.value })} /></label>
          <label className="field">API key<input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
          <p className="muted small">{PROVIDERS[adding.provider].keyHint ?? `Get a key from ${PROVIDERS[adding.provider].keyFrom}.`}</p>
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
