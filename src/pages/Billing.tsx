import { useEffect, useRef, useState } from 'react';
import { apiConfigured, clearLicense, getConfig, getRates, hasPendingPayment, history, openUrl, payAuthorize, payStart, payStatus, storedLicense, verifyLicense, type Payment, type PayStep, type Plan, type Rates, type Status } from '../billing/api';
import { isPremium } from '../quota/daily';
import { Dialog } from '../ui/Dialog';
import { AccountPanel } from '../ui/Account';
import { ngnFor, usdToNgn, type Fx } from '../billing/fx';

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
type Phase = 'form' | 'pin' | 'otp' | 'redirect' | 'wait' | 'done' | 'error';

function PayDialog({ plan, amount, onClose, onPaid }: { plan: Plan; amount: number; onClose: () => void; onPaid: () => void }) {
  const [phase, setPhase] = useState<Phase>('form');
  const [f, setF] = useState({ email: '', name: '', phoneCode: '234', phone: '', number: '', exp: '', cvv: '', agree: false });
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [url, setUrl] = useState('');
  const timer = useRef(0);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const route = (s: PayStep) => {
    setErr(''); setCode('');
    if (s.state === 'paid') { setPhase('done'); onPaid(); }
    else if (s.state === 'pin' || s.state === 'otp') setPhase(s.state);
    else if (s.state === 'redirect' && s.redirectUrl) { setUrl(s.redirectUrl); setPhase('redirect'); }
    else if (s.state === 'pending') { setPhase('wait'); poll(); }
    else { setErr(s.state === 'failed' ? `The payment was not completed${s.reason ? ` (${s.reason})` : ''}. You have not been charged for premium.` : 'This card needs a verification step that is not supported here. Try a different card.'); setPhase('error'); }
  };
  const poll = () => { window.clearInterval(timer.current); let n = 0; timer.current = window.setInterval(async () => { n++; try { const s = await payStatus(); if (s && s.state !== 'pending') { window.clearInterval(timer.current); route(s); } else if (n > 40) { window.clearInterval(timer.current); setErr('Still waiting for the bank. If you were charged, your premium will appear once it confirms; check again shortly.'); setPhase('error'); } } catch { /* keep polling */ } }, 3000); };
  const run = async (fn: () => Promise<PayStep | null>) => { setBusy(true); setErr(''); try { const s = await fn(); if (s) route(s); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); } };

  const [mm, yy] = f.exp.split('/').map((x) => x?.trim() ?? '');
  const ok = f.agree && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email) && f.name.trim().includes(' ') && f.phone.replace(/\D/g, '').length >= 7 && f.number.replace(/\D/g, '').length >= 12 && /^\d{1,2}$/.test(mm ?? '') && /^\d{2,4}$/.test(yy ?? '') && /^\d{3,4}$/.test(f.cvv);
  const submit = () => run(async () => {
    const card = { number: f.number, month: mm, year: yy, cvv: f.cvv };
    setF((x) => ({ ...x, number: '', cvv: '', exp: '' })); // clear card data from memory as soon as it is sent
    return payStart({ plan, expectedNgn: amount, email: f.email.trim(), name: f.name.trim(), phone: f.phone, phoneCode: f.phoneCode, card });
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const close = () => { window.clearInterval(timer.current); onClose(); };

  if (phase === 'form') return (
    <Dialog title="Pay for premium" onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!ok || busy} onClick={submit}>{busy ? 'Processing…' : `Pay ${naira(amount)}`}</button></>}>
      <p>You will pay <strong>{naira(amount)}</strong> once for {plan === 'annual' ? 'one year' : 'one month'} of premium. It does <strong>not</strong> renew automatically. Naira, card only, processed by Flutterwave.</p>
      <label className="field">Email<input type="email" autoComplete="email" value={f.email} onChange={set('email')} /></label>
      <label className="field">Name on card<input autoComplete="cc-name" value={f.name} onChange={set('name')} /></label>
      <div className="row nowrap"><label className="field" style={{ width: 80 }}>Code<input inputMode="numeric" value={f.phoneCode} onChange={set('phoneCode')} /></label><label className="field grow">Phone<input type="tel" autoComplete="tel-national" value={f.phone} onChange={set('phone')} /></label></div>
      <label className="field">Card number<input inputMode="numeric" autoComplete="cc-number" value={f.number} onChange={set('number')} /></label>
      <div className="row nowrap"><label className="field grow">Expiry (MM/YY)<input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={f.exp} onChange={set('exp')} /></label><label className="field grow">Security code<input inputMode="numeric" type="password" autoComplete="cc-csc" value={f.cvv} onChange={set('cvv')} /></label></div>
      <label className="check"><input type="checkbox" checked={f.agree} onChange={set('agree')} /> I have read the <a href="#/legal/billing">billing</a>, <a href="#/legal/refunds">refund</a>, <a href="#/legal/privacy">privacy</a> and <a href="#/legal/terms">terms</a> documents. I understand my card details pass through this app's server to be encrypted and sent to Flutterwave, and are not stored.</label>
      {err && <p className="error-text" role="alert">{err}</p>}
    </Dialog>);
  if (phase === 'pin' || phase === 'otp') return (
    <Dialog title={phase === 'pin' ? 'Enter your card PIN' : 'Enter the one-time code'} onClose={close} actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={code.length < 4 || busy} onClick={() => run(() => payAuthorize(phase === 'pin' ? { pin: code } : { otp: code }))}>{busy ? 'Checking…' : 'Continue'}</button></>}>
      <p>{phase === 'pin' ? 'Your bank needs the PIN for this card.' : 'Your bank sent a code by SMS or email. It expires quickly.'}</p>
      <label className="field">{phase === 'pin' ? 'Card PIN' : 'Code'}<input autoFocus inputMode="numeric" type="password" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      {err && <p className="error-text" role="alert">{err}</p>}
    </Dialog>);
  if (phase === 'redirect') return (
    <Dialog title="Verify with your bank" onClose={close} actions={<><button className="btn" onClick={close}>Close</button><button className="btn primary" onClick={() => { setPhase('wait'); poll(); }}>I have finished</button></>}>
      <p>Your bank needs you to confirm this payment on its page.</p><button className="btn" onClick={() => void openUrl(url)}>Open bank page</button>
    </Dialog>);
  if (phase === 'wait') return <Dialog title="Confirming payment" onClose={close} actions={<button className="btn" onClick={close}>Close</button>}><p role="status">Waiting for your bank to confirm. This usually takes a few seconds.</p><div className="progress" aria-hidden="true"><div /></div></Dialog>;
  if (phase === 'done') return <Dialog title="Payment received" onClose={close} actions={<button className="btn primary" onClick={close}>Done</button>}><p role="status">Premium is active. It will not renew by itself; renew here when it ends.</p></Dialog>;
  return <Dialog title="Payment not completed" onClose={close} actions={<><button className="btn" onClick={close}>Close</button><button className="btn primary" onClick={() => { setErr(''); setPhase('form'); }}>Try again</button></>}><p className="error-text" role="alert">{err}</p></Dialog>;
}

export function Billing() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [cfg, setCfg] = useState<{ checkoutEnabled: boolean; live: boolean } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [pays, setPays] = useState<Payment[]>([]);
  const [pay, setPay] = useState<Plan | null>(null);
  const [license, setLicense] = useState(storedLicense());
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false); const [, tick] = useState(0);
  const [fx, setFx] = useState<Fx | null>(null);
  useEffect(() => { void usdToNgn().then(setFx); }, []);

  const loadAccount = async (l: string) => { setStatus(await verifyLicense(l)); setPays((await history(l)).payments); tick((n) => n + 1); };
  useEffect(() => {
    if (!apiConfigured) return;
    getRates().then(setRates).catch((e: Error) => setMsg({ text: e.message, error: true }));
    getConfig().then(setCfg).catch(() => setCfg({ checkoutEnabled: false, live: false }));
    if (hasPendingPayment()) payStatus().then(async (s) => { if (s?.state === 'paid') { await loadAccount(storedLicense()); setMsg({ text: 'Payment confirmed. Premium is active.' }); } else if (s?.state === 'pending') setMsg({ text: 'A payment is still being confirmed. Check again in a moment.' }); }).catch(() => {});
    else if (storedLicense()) loadAccount(storedLicense()).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { const f = () => { const l = storedLicense(); if (l) { setLicense(l); loadAccount(l).catch(() => {}); } }; window.addEventListener('billing:licensed', f); return () => window.removeEventListener('billing:licensed', f); }, []); // eslint-disable-line
  const price = (p: Plan) => (p === 'monthly' ? rates?.monthlyNgn : rates?.annualNgn);
  const plans: { id: Plan; name: string; usd: number; per: string }[] = [{ id: 'monthly', name: 'Monthly', usd: 3, per: 'month' }, { id: 'annual', name: 'Annual', usd: 36, per: 'year' }];
  const ends = status?.currentPeriodEnd ? new Date(status.currentPeriodEnd) : null;

  return (
    <section className="page">
      <h1>Account and Billing</h1>
      <AccountPanel note="Your premium licence is saved to this Google account automatically, so signing in on a new device restores it." />
      <div className="panel"><h2>Your plan</h2>
        <p>{isPremium() ? `Premium is active${ends ? ` until ${ends.toLocaleDateString()}` : ''}.` : status?.status === 'expired' ? `Premium ended on ${ends?.toLocaleDateString()}. Renew below to continue.` : 'Free plan: unlimited image and video creation, 10 attachments and 10 file-analysis requests every 5 hours, 3 web searches daily, and chats saved on this device.'}</p>
        <p className="muted small">Premium is prepaid and never renews automatically. Paying again before it ends adds time on top.</p></div>
      {msg && <div className={`notice${msg.error ? ' error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</div>}
      {cfg && !cfg.checkoutEnabled && <div className="notice warn" role="note">Payments are unavailable right now. Please try again later.</div>}
      <div className="stats">{plans.map((p) => (
        <div className="panel stack" key={p.id}><h2>{p.name}</h2>
          <div className="stat">${p.usd}<span className="muted small"> / {p.per}</span></div>
          {price(p.id) || fx ? <div className="stat naira">{price(p.id) ? naira(price(p.id)!) : `≈ ${naira(ngnFor(p.usd, fx!.rate))}`}<span className="muted small"> {price(p.id) ? 'once' : 'estimate'}</span></div> : <p className="muted small">Loading the naira price…</p>}
          <button className="btn primary" disabled={!cfg?.checkoutEnabled || !price(p.id)} onClick={() => setPay(p.id)}>{isPremium() ? 'Add time' : 'Buy'} {p.name.toLowerCase()}</button></div>))}</div>
      <div className="panel"><h2>Premium includes</h2><ul className="plain-list"><li><strong>Unlimited file analysis.</strong> Free accounts get 10 completed file-analysis requests every 5 hours.</li><li><strong>Deeper web research.</strong> Free accounts get 3 web searches daily; Premium gets up to 30 daily searches and up to 8 results per search.</li><li><strong>Longer chat context.</strong> Premium can reference up to 40 recent exchanges in the current conversation; Free uses up to 8. All saved chat history remains available.</li><li><strong>No attachment limit.</strong> Free accounts get 10 attachments every 5 hours.</li></ul><p className="muted small">Image and video creation are unlimited for everyone. You still pay your AI providers directly, and their limits still apply.</p>
        <p className="muted small">Read the <a href="#/legal/billing">Subscription and Billing Policy</a>, <a href="#/legal/refunds">Cancellation and Refund Policy</a> and <a href="#/legal/terms">Terms</a> first.</p></div>
      {hasPendingPayment() && <div className="panel stack"><h2>Payment waiting</h2><p className="muted">Finished paying? Check it.</p><div className="row"><button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { const s = await payStatus(); if (s?.state === 'paid') { await loadAccount(storedLicense()); setMsg({ text: 'Payment confirmed. Premium is active.' }); } else setMsg({ text: s?.state === 'pending' ? 'Still waiting for the bank.' : 'That payment was not completed.', error: s?.state === 'failed' }); } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not check.', error: true }); } finally { setBusy(false); tick((n) => n + 1); } }}>Check payment</button></div></div>}
      {pays.length > 0 && <div className="panel"><h2>Billing history</h2><ul className="list flush">{pays.map((x) => <li key={x.reference} className="item"><span className="grow small">{x.at ? new Date(x.at).toLocaleDateString() : ''}</span><span>{x.currency === 'NGN' ? naira(x.amount) : `${x.amount} ${x.currency}`}</span></li>)}</ul></div>}
      <div className="panel stack"><h2>Verify or restore premium</h2>
        <p className="muted small">Your license is saved on this device after you pay. Keep a copy somewhere safe: we cannot look it up for you.</p>
        <label className="field">License<input value={license} autoComplete="off" spellCheck={false} onChange={(e) => setLicense(e.target.value)} /></label>
        <div className="row"><button className="btn" disabled={!license.trim() || busy || !apiConfigured} onClick={async () => { setBusy(true); setMsg(null); try { await loadAccount(license); } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Verification failed.', error: true }); } finally { setBusy(false); } }}>Verify</button>
          {storedLicense() && <button className="btn" onClick={() => { clearLicense(); setLicense(''); setStatus(null); setPays([]); tick((n) => n + 1); }}>Remove license from this device</button>}</div>
        {storedLicense() && <p className="muted small small-break">Your license: <code>{storedLicense()}</code></p>}</div>
      {pay && price(pay) && <PayDialog plan={pay} amount={price(pay)!} onClose={() => setPay(null)} onPaid={() => { void loadAccount(storedLicense()).catch(() => {}); }} />}
    </section>
  );
}
