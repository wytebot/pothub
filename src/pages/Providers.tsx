import { useEffect, useState } from 'react';
import { unlock, lock, isUnlocked } from '../vault/auth';
import { addBackendKey, addKey, defaultKeys, getSecret, isDefaultFor, listKeys, removeKey, setBackendModel, setDefault, setStatus, storageKind, updateKey, type KeyMeta, type ProviderId } from '../vault/vault';
import { testKey } from '../models/providers';
import { FNS, FN_LABEL, PROVIDERS, PROVIDER_IDS, fieldsOf, fnsOf, joinSecret, splitSecret } from '../models/providerInfo';
import { fetchInfo } from '../models/gateway';
import { backendUrl, BACKEND_VARIABLES } from '../models/gatewayRef';
import { dropCatalogCache } from '../agent/detect';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';

const badge: Record<KeyMeta['status'], string> = { untested: 'Not tested', ok: 'Connected', invalid: 'Rejected', error: 'Check failed' };
/** Set VITE_ALLOW_DEVICE_KEYS=false at build time to remove the option of pasting a key into the app at all. */
const DEVICE_KEYS = (import.meta.env.VITE_ALLOW_DEVICE_KEYS as string | undefined)?.trim().toLowerCase() !== 'false';
const isBackend = (k: KeyMeta) => k.source === 'backend';
const hostOf = (u?: string) => { try { return new URL(u ?? '').host; } catch { return u ?? ''; } };

/** Dialog for a key kept on this device (the advanced option). */
interface Editor { provider: ProviderId; label: string; edit?: KeyMeta; /** edit only: the saved secret has every box, so an empty box keeps its saved value */ complete?: boolean; }

export function Providers() {
  const [open, setOpen] = useState(() => isUnlocked() || !listKeys().some((k) => !isBackend(k)));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [keys, setKeys] = useState<KeyMeta[]>(listKeys());
  const [dlg, setDlg] = useState<Editor | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<KeyMeta | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const [devProvider, setDevProvider] = useState<ProviderId>('openai');
  const [addr, setAddr] = useState('');
  const [name, setName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connErr, setConnErr] = useState('');
  const [connOk, setConnOk] = useState('');
  const [copied, setCopied] = useState(false);
  const refresh = () => { dropCatalogCache(); setKeys(listKeys()); };
  const close = () => { setVals({}); setDlg(null); setErr(''); };

  useEffect(() => () => { setVals({}); }, []);

  const doUnlock = async (): Promise<boolean> => {
    setErr(''); const r = await unlock();
    if (r.ok) { setOpen(true); setNote(r.note ?? ''); return true; }
    setErr(r.reason); return false;
  };
  const connect = async () => {
    setConnErr(''); setConnOk(''); setConnecting(true);
    try {
      const base = backendUrl(addr);
      const info = await fetchInfo(base);
      if (!info.ready) throw new Error(`This backend answered but is not finished. Still missing: ${info.missing.join(', ')}. Add ${info.missing.length > 1 ? 'them' : 'it'} in the backend's environment variables, redeploy, then connect again.`);
      const k = await addBackendKey(name, base, info);
      setConnOk(`Connected: ${PROVIDERS[k.provider].name} · ${k.model}`); setAddr(''); setName(''); refresh();
    } catch (e) { setConnErr(e instanceof Error ? e.message : 'Could not connect to that backend.'); }
    finally { setConnecting(false); }
  };
  const copyNames = async () => {
    try { await navigator.clipboard.writeText(BACKEND_VARIABLES.map((v) => `${v.name}=`).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the names are on screen */ }
  };
  const startDevice = async (provider: ProviderId) => { if (!isUnlocked() && !(await doUnlock())) return; setErr(''); setVals({}); setDlg({ provider, label: '' }); };
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
    try {
      if (isBackend(k)) {
        // The backend's model can change; read it again so the app uses the current one.
        const info = await fetchInfo(k.gateway ?? '');
        if (info.model && info.model !== k.model) setBackendModel(k.id, info.model);
        if (!info.ready) throw new Error(`The backend is missing: ${info.missing.join(', ')}.`);
      }
      const r = await testKey(k.provider, await getSecret(k.id));
      setStatus(k.id, r.status); setMsg({ id: k.id, text: isBackend(k) && r.status === 'ok' ? 'Connected. Your backend reached the provider with its key.' : r.message, error: r.status !== 'ok' });
    } catch (e) { setMsg({ id: k.id, text: e instanceof Error ? e.message : 'Test failed.', error: true }); }
    finally { setBusy(''); refresh(); }
  };

  if (!open) return (
    <section className="page">
      <h1>AI Providers</h1>
      <div className="panel">
        <h2>Locked</h2>
        <p>Confirm with your fingerprint or device lock to manage the keys saved on this device.</p>
        {err && <p className="error-text" role="alert">{err}</p>}
        <button className="btn primary" onClick={() => void doUnlock()}>Unlock</button>
      </div>
    </section>
  );

  const fields = dlg ? fieldsOf(dlg.provider) : [];
  const canSave = !!dlg && (dlg.edit ? dlg.label.trim() !== dlg.edit.label || fields.some((f) => (vals[f.id] ?? '').trim()) : fields.every((f) => (vals[f.id] ?? '').trim()));
  const hasDeviceKeys = keys.some((k) => !isBackend(k));

  return (
    <section className="page">
      <header className="page-head">
        <h1>AI Providers</h1>
        <div className="row">
          <button className="btn" disabled={!!busy || keys.length === 0} onClick={async () => { for (const k of keys) await test(k); }}>Test all</button>
          {hasDeviceKeys && <button className="btn" onClick={() => { lock(); setOpen(false); }}>Lock now</button>}
        </div>
      </header>
      {note && <div className="notice warn" role="note">{note}</div>}

      <div className="panel stack">
        <h2>Connect your backend</h2>
        <p className="muted small">Keep your API key on your own backend, not in this app. Pothub only needs the backend's address. The backend reads configurable environment-variable names; see its environment template for optional POTHUB_*_ENV mappings.</p>
        <ol className="small stack">
          <li>On your backend (Vercel or any host) add these variables:
            <ul className="list flush">{BACKEND_VARIABLES.map((v) => <li key={v.name} className="item wrap"><div className="grow"><code>{v.name}</code><div className="muted small">{v.note}</div></div></li>)}</ul>
            <button className="btn" onClick={() => void copyNames()}>{copied ? 'Copied!' : 'Copy variable names'}</button>
          </li>
          <li>Deploy it and copy its address.</li>
          <li>Paste the address here:</li>
        </ol>
        <label className="field">Backend address<input value={addr} type="url" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="https://my-backend.vercel.app" onChange={(e) => setAddr(e.target.value)} /></label>
        <label className="field">Name (optional)<input value={name} maxLength={40} placeholder="My backend" onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn primary" disabled={connecting || !addr.trim()} onClick={() => void connect()}>{connecting ? 'Connecting…' : 'Connect'}</button>
        {connErr && <p className="error-text" role="alert">{connErr}</p>}
        {connOk && <p className="small" role="status">{connOk}</p>}
        <p className="muted small">Only connect a backend you set up yourself: it receives your prompts and files. The backend decides the provider and model, so the app cannot pick a different one.</p>
      </div>

      {keys.length > 0 && (
        <div className="panel stack">
          <h2>Default routing</h2>
          {FNS.map((f) => { const chain = defaultKeys(f); return (
            <p className="small" key={f}><strong>{FN_LABEL[f]}:</strong> {chain.length ? chain.map((k) => `${PROVIDERS[k.provider].name} (${k.label})`).join(' → ') : <span className="error-text">no default key, so this is switched off</span>}</p>
          ); })}
          <p className="muted small">Pothub only uses connections ticked as a default, for the functions you ticked. If one fails (rejected key, no credit, rate limit), it moves to the next default for that function, in the order shown.</p>
        </div>
      )}

      {keys.length > 0 && (
        <div className="panel">
          <h2>Your connections</h2>
          <ul className="list flush">
            {keys.map((k) => (
              <li key={k.id} className="item wrap">
                <div className="grow"><div className="title">{k.label}</div><div className="muted small">{PROVIDERS[k.provider].name}{isBackend(k) ? ` · ${k.model ?? 'model set on backend'} · ${hostOf(k.gateway)}` : ` · •••• ${k.last4} · on this device`}</div></div>
                <span className={`chip ${k.status}`}>{badge[k.status]}</span>
                <button className="btn" disabled={busy === k.id} onClick={() => test(k)}>{busy === k.id ? 'Testing…' : 'Test'}</button>
                {!isBackend(k) && <button className="btn" onClick={() => startEdit(k)}>Edit</button>}
                <button className="btn" onClick={() => setRemoving(k)}>{isBackend(k) ? 'Disconnect' : 'Remove'}</button>
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
      )}

      {DEVICE_KEYS && (
        <details className="panel stack advanced-keys">
          <summary>Advanced: store a key on this device</summary>
          <p className="muted small">Not recommended. A key saved here lives in {storageKind()} and anyone with full access to your unlocked device could still reach it. Prefer a backend. If you must, use a key with a spending limit.</p>
          <div className="row wrap">
            <Select<ProviderId> label="Provider" value={devProvider} onChange={setDevProvider} options={PROVIDER_IDS.map((v) => ({ value: v, label: PROVIDERS[v].name }))} />
            <button className="btn" onClick={() => void startDevice(devProvider)}>Add key to this device</button>
          </div>
        </details>
      )}

      {dlg && (
        <Dialog title={dlg.edit ? `Edit ${PROVIDERS[dlg.provider].name} key` : 'Add a key to this device'} onClose={close} actions={<>
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
        <Dialog title={isBackend(removing) ? 'Disconnect backend?' : 'Remove key?'} onClose={() => setRemoving(null)} actions={<>
          <button className="btn" onClick={() => setRemoving(null)}>Keep it</button>
          <button className="btn danger" onClick={async () => { const k = removing; setRemoving(null); await removeKey(k.id); refresh(); }}>{isBackend(removing) ? 'Disconnect' : 'Remove key'}</button>
        </>}>
          {isBackend(removing)
            ? <p>"{removing.label}" will stop being used by Pothub. Your backend and its key are not touched.</p>
            : <p>"{removing.label}" (•••• {removing.last4}) will be deleted from this device. It stays active with your provider until you revoke it there.</p>}
        </Dialog>
      )}
    </section>
  );
}
