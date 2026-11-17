import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FREE_LIMITS, isPremium, record, remaining, usage } from '../quota/daily';
import { listKeys } from '../vault/vault';
import { listLibrary, putMedia, uid, type MediaRecord } from '../storage/db';
import { RunLog, logFor, useRunLog } from '../agent/log';
import { Terminal } from '../ui/Terminal';
import { runImage, runInfo, runVideoStart } from '../agent/workflow';
import { parseCommands } from '../agent/commands';
import { interpret } from '../models/router';
import { addJob, readJobs } from '../agent/jobs';
import { getSettings } from '../settings';
import { platform } from '../platform';

interface Msg { id: string; role: 'user' | 'assistant'; text: string; state?: 'working' | 'done' | 'error'; media?: string[]; jobId?: string; }
const KEY = 'chat.v2'; const KEEP = 50;
const PROMPTS = [
  'A cinematic product photo of a luxury wristwatch',
  'A 10-second cinematic video of Lagos at night',
  'A clean editorial portrait in soft studio lighting',
  'A vertical social media advert for a skincare brand',
  'A futuristic city skyline at golden hour',
  'A cozy reading nook with rain on the window',
  'A slow aerial video over a green coastline',
  'A bold poster for an Afrobeats concert',
  'A watercolor map of an imaginary island',
  'A macro photo of dew on a spider web',
  'A product video of sneakers spinning on a pedestal',
  'A logo mark of a fox made from simple shapes',
];
const logs = new Map<string, RunLog>();
const urls = new Map<string, string>();
const urlFor = (r: MediaRecord) => { let u = urls.get(r.id); if (!u) { u = URL.createObjectURL(r.blob); urls.set(r.id, u); } return u; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
const ext = (mime: string) => (mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png');

function load(): Msg[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Msg[];
    return all.map((m) => {
      if (m.state !== 'working') return m;
      const j = m.jobId ? readJobs().find((x) => x.id === m.jobId) : undefined;
      return j?.status === 'running' ? m : { ...m, state: 'error' as const, text: 'This request was interrupted. Send it again.' };
    });
  } catch { return []; }
}

function Status({ log }: { log?: RunLog }) {
  const lines = useRunLog(log); const last = lines[lines.length - 1];
  return <div className="chat-status"><span className="spin" />{last ? last.text.replace(/^pothub /, '') : 'Starting…'}</div>;
}

function Media({ ids }: { ids: string[] }) {
  const [recs, setRecs] = useState<MediaRecord[]>([]);
  const key = ids.join(',');
  useEffect(() => { let live = true; void listLibrary().then((all) => { if (live) setRecs(ids.map((id) => all.find((r) => r.id === id)).filter((r): r is MediaRecord => !!r)); }).catch(() => {}); return () => { live = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!recs.length) return null;
  return (
    <div className="chat-media">
      {recs.map((r) => (
        <figure key={r.id} className="chat-tile">
          {r.kind === 'video' ? <video src={urlFor(r)} controls playsInline preload="metadata" /> : <img src={urlFor(r)} alt={r.name.replace(/-/g, ' ')} />}
          <button className="chat-dl" onClick={() => void platform.saveFile(r.blob, r.name)}>Download</button>
        </figure>
      ))}
    </div>
  );
}

export function Home() {
  const [messages, setMessages] = useState<Msg[]>(load);
  const [idea, setIdea] = useState('');
  const [active, setActive] = useState(false);
  const [lift, setLift] = useState(0);
  const [, tick] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const prompts = useMemo(() => [...PROMPTS].sort(() => Math.random() - 0.5), []);
  const providerCount = new Set(listKeys().filter((k) => k.isDefault && k.status !== 'invalid').map((k) => k.provider)).size;
  const premium = isPremium(); const u = usage();
  const imagesLeft = Math.max(0, FREE_LIMITS.image - u.image); const videosLeft = Math.max(0, FREE_LIMITS.video - u.video);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-KEEP))); } catch { /* storage full */ } }, [messages]);

  // Rise with the on-screen keyboard (browsers that do not resize the page themselves).
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return;
    const f = () => { setLift(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))); };
    f(); vv.addEventListener('resize', f); vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);

  // Grow with the text, up to about 40% of the visible height.
  useEffect(() => {
    const el = input.current; if (!el) return;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const cap = Math.max(112, Math.min(300, Math.round(vh * 0.4)));
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, cap)}px`; el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
  }, [idea, lift]);

  // A video that finished (or failed) while the chat was open.
  useEffect(() => {
    const sync = () => {
      setMessages((ms) => ms.map((m) => {
        if (!m.jobId || m.state !== 'working') return m;
        const j = readJobs().find((x) => x.id === m.jobId);
        if (!j) return { ...m, state: 'error' as const, text: 'This video request was removed.' };
        if (j.status === 'done' && j.mediaId) return { ...m, state: 'done' as const, text: 'Your video is ready.', media: [j.mediaId] };
        if (j.status === 'failed' || j.status === 'cancelled') return { ...m, state: 'error' as const, text: j.error ?? 'Stopped waiting for this video.' };
        return m;
      }));
      tick((n) => n + 1);
    };
    sync(); window.addEventListener('jobs:changed', sync);
    return () => window.removeEventListener('jobs:changed', sync);
  }, []);

  // Keep the newest message in view while work is running.
  const working = active || messages.some((m) => m.state === 'working');
  const toEnd = (smooth = false) => { const el = thread.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  useEffect(() => { toEnd(true); }, [messages.length, lift]);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => { const el = thread.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight; }, 400);
    return () => clearInterval(t);
  }, [working]);

  const patch = (id: string, p: Partial<Msg>) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const run = async (id: string, prompt: string, log: RunLog) => {
    const ctl = new AbortController(); abort.current = ctl; const signal = ctl.signal;
    try {
      const { text, flags } = parseCommands(prompt);
      if (flags.models) { await runInfo(prompt, log, signal); patch(id, { state: 'done', text: 'These are the models your connected providers offer right now.' }); return; }
      const task = flags.task ?? interpret(text).task;
      if (task === 'video') {
        const st = await runVideoStart({ prompt, modelId: 'auto', signal, log, left: remaining('video'), limit: FREE_LIMITS.video, premium: isPremium() });
        const jobId = uid();
        addJob({ id: jobId, provider: st.model.provider, keyId: st.keyId, model: st.model.id, op: st.op, prompt: st.prompt, aspect: st.aspect, createdAt: Date.now(), status: 'running' });
        logFor(jobId).say('info', `job started with ${st.model.name}`);
        patch(id, { jobId, state: 'working', text: `Rendering with ${st.model.name}. Videos usually take a few minutes. You can keep chatting or leave this page.` });
        return;
      }
      const res = await runImage({ prompt, count: 1, format: 'auto', prefer: getSettings().priority, model: 'auto', signal, log, left: remaining('image'), limit: FREE_LIMITS.image, premium: isPremium() });
      const sv = log.start('cmd', 'library.save'); const ids: string[] = [];
      for (const m of res.images) { const mid = uid(); await putMedia({ id: mid, projectId: null, kind: 'image', name: `${slug(res.prompt)}.${ext(m.mime)}`, mime: m.mime, size: m.blob.size, createdAt: Date.now(), blob: m.blob }); ids.push(mid); }
      record('image', res.images.length); log.done(sv, `${ids.length} saved on this device`); log.say('ok', 'done');
      patch(id, { state: 'done', media: ids, text: [`Made with ${res.model.name} at ${res.aspect}.`, ...res.notes].join(' ') });
    } catch (e) {
      log.settle('failed');
      const m = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      if (m === 'Cancelled.') { log.say('warn', 'cancelled'); patch(id, { state: 'error', text: 'Cancelled.' }); } else { log.say('err', m); patch(id, { state: 'error', text: m }); }
    } finally { abort.current = null; setActive(false); tick((n) => n + 1); }
  };

  const send = (value = idea) => {
    const prompt = value.trim(); if (!prompt || active) return;
    const id = uid(); const log = new RunLog(); logs.set(id, log);
    setMessages((ms) => [...ms, { id: uid(), role: 'user', text: prompt }, { id, role: 'assistant', text: '', state: 'working' }]);
    setIdea(''); setActive(true);
    void run(id, prompt, log);
  };
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const track = [...prompts, ...prompts];

  return (
    <section className="chat-home" style={{ '--kb': `${lift}px` } as CSSProperties}>
      <header className="chat-top">
        <div className="usage" aria-label="Usage left today">
          {premium ? <span>Premium · unlimited</span> : <><span><b>{imagesLeft}</b> images</span><i aria-hidden="true" /><span><b>{videosLeft}</b> videos</span><span className="muted"> left today</span></>}
        </div>
        {messages.length > 0 && <button className="chat-new" onClick={() => { setMessages([]); setIdea(''); }}>New chat</button>}
      </header>

      <div className="chat-thread" ref={thread} aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <h2>What do you want to create?</h2>
            {providerCount === 0 && <p className="muted small">Connect an AI provider first. <a href="#/providers">Add an API key</a></p>}
          </div>
        ) : messages.map((m) => m.role === 'user' ? (
          <div key={m.id} className="chat-message user"><div className="message-content">{m.text}</div></div>
        ) : (
          <div key={m.id} className="chat-message assistant">
            <div className="assistant-body">
              {logs.get(m.id) && (getSettings().terminal ? <Terminal log={logs.get(m.id)!} title="Workflow" /> : m.state === 'working' && !m.jobId ? <Status log={logs.get(m.id)} /> : null)}
              {m.jobId && getSettings().terminal && m.state === 'working' && <Terminal log={logFor(m.jobId)} title="Render" />}
              {m.state === 'working' && !logs.get(m.id) && !m.jobId && <div className="chat-status"><span className="spin" />Working…</div>}
              {m.text && <p className={`reply${m.state === 'error' ? ' error-text' : ''}`}>{m.text}{m.state === 'error' && /AI Providers/.test(m.text) && <> <a href="#/providers">Open AI Providers</a></>}</p>}
              {m.state === 'working' && m.jobId && !getSettings().terminal && <div className="progress" aria-hidden="true"><div /></div>}
              {m.media && m.media.length > 0 && <Media ids={m.media} />}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-bottom">
        {!idea.trim() && (
          <div className="marquee" aria-label="Suggested prompts">
            <div className="marquee-track">
              {track.map((p, i) => <button key={`${p}-${i}`} className="suggestion" tabIndex={i < prompts.length ? 0 : -1} aria-hidden={i >= prompts.length} onClick={() => { setIdea(p); input.current?.focus(); }}>{p}</button>)}
            </div>
          </div>
        )}
        <div className="chat-composer">
          <textarea ref={input} value={idea} rows={1} maxLength={4000} enterKeyHint="send" placeholder="Describe an image or video…" aria-label="Describe what to create"
            onChange={(e) => setIdea(e.target.value)} onFocus={() => setTimeout(() => toEnd(), 250)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); send(); } }} />
          {active
            ? <button className="send-button stop" aria-label="Stop" onClick={() => abort.current?.abort()}><span>■</span></button>
            : <button className="send-button" aria-label="Create" disabled={!idea.trim()} onClick={() => send()}><span>↑</span></button>}
        </div>
      </div>
    </section>
  );
}
