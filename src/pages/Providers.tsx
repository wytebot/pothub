import { useEffect, useState } from 'react';
import { unlock, lock, isUnlocked } from '../vault/auth';
import { addKey, getSecret, listKeys, removeKey, setStatus, storageKind, type KeyMeta, type ProviderId } from '../vault/vault';
import { PROVIDERS, testKey } from '../models/providers';
import { IMAGE_MODELS } from '../models/registry';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';

const badge: Record<KeyMeta['status'], string> = { untested: 'Not tested', ok: 'Connected', invalid: 'Rejected', error: 'Check failed' };

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
  const refresh = () => setKeys(listKeys());

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
        <p className="muted small">This check controls who can open this page. It is not encryption: stored keys are protected separately, as described after you unlock.</p>
        {err && <p className="error-text" role="alert">{err}</p>}
        <button className="btn primary" onClick={doUnlock}>Unlock</button>
      </div>
    </section>
  );

  return (
    <section className="page">
      <header className="page-head">
        <h1>AI Providers</h1>
        <div className="row">
          <button className="btn" disabled={!!busy || keys.length === 0} onClick={async () => { for (const k of keys) await test(k); }}>Test all</button>
          <button className="btn" onClick={() => { lock(); setOpen(false); }}>Lock now</button>
          <button className="btn primary" onClick={() => { setErr(''); setSecret(''); setAdding({ provider: 'openai', label: '' }); }}>Add key</button>
        </div>
      </header>
      {note && <div className="notice warn" role="note">{note}</div>}
      <div className="notice" role="note">
        You pay each provider directly for what you generate. Keys are stored with {storageKind()} and are never shown again after saving. A fingerprint prompt is not server-grade security: anyone with full access to an unlocked device or browser tools could still extract keys. Use keys with spending limits.
      </div>
      {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => {
        const mine = keys.filter((k) => k.provider === p);
        return (
          <div className="panel" key={p}>
            <h2>{PROVIDERS[p].name}</h2>
            <p className="muted small">{PROVIDERS[p].billing}</p>
            <p className="muted small">Models: {IMAGE_MODELS.filter((m) => m.provider === p).map((m) => m.name).join(', ')}</p>
            {mine.length === 0 ? <p className="muted">No key added.</p> : (
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
            )}
          </div>
        );
      })}

      {adding && (
        <Dialog title={adding.replace ? 'Replace key' : 'Add key'} onClose={() => { setSecret(''); setAdding(null); }} actions={<>
          <button className="btn" onClick={() => { setSecret(''); setAdding(null); }}>Cancel</button>
          <button className="btn primary" disabled={!secret.trim()} onClick={save}>Save key</button>
        </>}>
          {!adding.replace && <Select<ProviderId> label="Provider" value={adding.provider} onChange={(v) => setAdding({ ...adding, provider: v })} options={(Object.keys(PROVIDERS) as ProviderId[]).map((v) => ({ value: v, label: PROVIDERS[v].name }))} />}
          <label className="field">Name<input value={adding.label} maxLength={40} placeholder="Personal key" onChange={(e) => setAdding({ ...adding, label: e.target.value })} /></label>
          <label className="field">API key<input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
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
