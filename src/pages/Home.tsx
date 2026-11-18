import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FREE_LIMITS, isPremium, record, remaining, usage } from '../quota/daily';
import { defaultKeys } from '../vault/vault';
import { FNS } from '../models/providerInfo';
import { listLibrary, putMedia, uid, type MediaRecord } from '../storage/db';
import { RunLog, logFor } from '../agent/log';
import { FadeStatus } from '../ui/FadeStatus';
import { Markdown } from '../ui/Markdown';
import { MediaPicker } from '../ui/MediaPicker';
import { useOutside } from '../ui/useOutside';
import { runImage, runInfo, runText, runVideoStart } from '../agent/workflow';
import { parseCommands } from '../agent/commands';
import { interpret } from '../models/router';
import { addJob, readJobs } from '../agent/jobs';
import { friendlyNote, type TaskName } from '../agent/friendly';
import { MAX_FILES, meta, sizeLabel, toAttachments, type Attachment, type AttachmentMeta } from '../agent/attachments';
import type { OutFile } from '../agent/deliver';
import type { ChatTurn } from '../models/text';
import { getSettings } from '../settings';
import { platform } from '../platform';
import { Icon } from '../ui/Icon';
import { detectLocal, runLocal } from '../agent/local';

interface Msg {
  id: string; role: 'user' | 'assistant'; text: string; state?: 'working' | 'done' | 'error';
  kind?: 'text' | 'image' | 'video'; media?: string[]; jobId?: string;
  /** user messages: what was attached (names only, the bytes are not kept in the saved chat) */
  files?: AttachmentMeta[];
  /** assistant messages: a short friendly note under the reply (a problem, or something worth knowing) */
  note?: string; providers?: boolean; notes?: string[];
  /** assistant messages: a file that was built for the person */
  fileOut?: { name: string; size: number };
}
const KEY = 'chat.v3'; const KEEP = 50;
const PROMPTS = [
  'A cinematic product photo of a luxury wristwatch',
  'Write a detailed business plan for a small bakery in Lagos',
  'A 10-second cinematic video of Lagos at night',
  'Explain how mortgages work, with worked examples',
  'A clean editorial portrait in soft studio lighting',
  'Create a 7-day study plan for exam revision as a table',
  'A vertical social media advert for a skincare brand',
  'A futuristic city skyline at golden hour',
  'Write a professional cover letter for a sales role as a Word document',
  'A cozy reading nook with rain on the window',
  'Compare React and Vue for a small team, in a table',
  'A slow aerial video over a green coastline',
  'A bold poster for an Afrobeats concert',
  'A watercolor map of an imaginary island',
  'Summarise a long article into key points (attach it with +)',
  'A macro photo of dew on a spider web',
  'A logo mark of a fox made from simple shapes',
];
const logs = new Map<string, RunLog>();
const urls = new Map<string, string>();
const outFiles = new Map<string, OutFile>();
const sent = new Map<string, Attachment[]>();
const urlFor = (r: MediaRecord) => { let u = urls.get(r.id); if (!u) { u = URL.createObjectURL(r.blob); urls.set(r.id, u); } return u; };
const thumbs = new Map<string, string>();
const thumbOf = (a: Attachment) => { let u = thumbs.get(a.id); if (!u) { u = URL.createObjectURL(a.blob); thumbs.set(a.id, u); } return u; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
const ext = (mime: string) => (mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png');
const GLYPH: Record<string, string> = { pdf: 'PDF', docx: 'DOC', text: 'TXT', audio: '♪', video: '▶', image: '▣' };

function load(): Msg[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem('chat.v2') ?? '[]') as Msg[];
    return all.map((m) => {
      if (m.fileOut) m = { ...m, fileOut: undefined }; // the built file only lives while the app is open
      if (m.state !== 'working') return m;
      const j = m.jobId ? readJobs().find((x) => x.id === m.jobId) : undefined;
      return j?.status === 'running' ? m : { ...m, state: 'error' as const, note: 'This request was interrupted. Send it again.' };
    });
  } catch { return []; }
}

/** The last few answered questions, so a follow-up like "make it shorter" has something to refer to. Only text answers count. */
function historyOf(ms: Msg[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i]; const u = ms[i - 1];
    if (a.role === 'assistant' && a.kind === 'text' && a.state === 'done' && a.text && u.role === 'user' && u.text) turns.push({ role: 'user', text: u.text }, { role: 'assistant', text: a.text });
  }
  let kept = turns.slice(-12); let size = kept.reduce((n, t) => n + t.text.length, 0);
  while (kept.length > 2 && size > 24_000) { size -= kept[0].text.length + kept[1].text.length; kept = kept.slice(2); }
  return kept;
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
          <button className="chat-dl" aria-label="Download" title="Download" onClick={() => void platform.saveFile(r.blob, r.name)}><Icon name="download" size={16} /></button>
        </figure>
      ))}
    </div>
  );
}

function Chip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  return (
    <span className="attach-chip" title={`${a.name} · ${sizeLabel(a.size)}`}>
      {a.kind === 'image' ? <img src={thumbOf(a)} alt="" /> : <span className="attach-glyph" aria-hidden="true">{GLYPH[a.kind] ?? 'FILE'}</span>}
      <span className="attach-name">{a.name}</span>
      {onRemove && <button className="attach-x" aria-label={`Remove ${a.name}`} onClick={onRemove}><Icon name="close" size={12} /></button>}
    </span>
  );
}

function Reply({ m }: { m: Msg }) {
  const isText = m.kind === 'text' && !!m.text;
  return (
    <>
      {isText ? <Markdown text={m.text} /> : m.text && <p className="reply">{m.text}</p>}
      {m.notes?.map((n, i) => <p key={i} className="reply-note">{n}</p>)}
      {m.note && <div className={`friendly-note${m.state === 'error' ? '' : ' soft'}`} role="status"><p>{m.note}</p>{m.providers && <a href="#/providers">Open AI Providers</a>}</div>}
    </>
  );
}

const recOf = (a: Attachment): MediaRecord | null => (a.kind === 'image' || a.kind === 'video' || a.kind === 'audio' ? { id: a.id, projectId: null, kind: a.kind, name: a.name, mime: a.mime, size: a.size, createdAt: Date.now(), blob: a.blob } : null);
const recsFor = async (ids: string[]) => (await listLibrary()).filter((r) => ids.includes(r.id));

export function Home() {
  const [messages, setMessages] = useState<Msg[]>(load);
  const [idea, setIdea] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileNote, setFileNote] = useState('');
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(false);
  const [picker, setPicker] = useState<{ extra: MediaRecord[]; preselect: string[] } | null>(null);
  const [copied, setCopied] = useState('');
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [lift, setLift] = useState(0);
  const [, tick] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const plus = useRef<HTMLDivElement>(null);
  const mediaIn = useRef<HTMLInputElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const prompts = useMemo(() => [...PROMPTS].sort(() => Math.random() - 0.5), []);
  const providerCount = new Set(FNS.flatMap((f) => defaultKeys(f).map((k) => k.provider))).size;
  const premium = isPremium(); const u = usage();
  const imagesLeft = Math.max(0, FREE_LIMITS.image - u.image); const videosLeft = Math.max(0, FREE_LIMITS.video - u.video);
  const closeMenu = useCallback(() => setMenu(false), []);
  useOutside(plus, menu, closeMenu);

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
        if (!j) return { ...m, state: 'error' as const, note: 'This video request was removed.' };
        if (j.status === 'done' && j.mediaId) return { ...m, state: 'done' as const, text: 'Your video is ready.', media: [j.mediaId] };
        if (j.status === 'failed' || j.status === 'cancelled') return { ...m, state: 'error' as const, text: '', note: j.error ?? 'Stopped waiting for this video.' };
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

  // ---- attachments (+ button, paste, drop) ----
  const addFiles = (list: FileList | File[] | null | undefined) => {
    const picked = Array.from(list ?? []); if (!picked.length) return;
    const { added, skipped } = toAttachments(picked, files);
    if (added.length) setFiles((f) => [...f, ...added]);
    setFileNote(skipped.length ? `${skipped.slice(0, 2).join('. ')}${skipped.length > 2 ? ` (and ${skipped.length - 2} more)` : ''}.` : '');
    setMenu(false); input.current?.focus();
  };
  useEffect(() => { if (!fileNote) return; const t = setTimeout(() => setFileNote(''), 7000); return () => clearTimeout(t); }, [fileNote]);
  const pick = (el: HTMLInputElement | null) => { setMenu(false); if (el) { el.value = ''; el.click(); } };

  const run = async (id: string, prompt: string, log: RunLog, atts: Attachment[], history: ChatTurn[]) => {
    const ctl = new AbortController(); abort.current = ctl; const signal = ctl.signal;
    let task: TaskName = 'image'; let partial = '';
    try {
      const { text, flags } = parseCommands(prompt);
      if (flags.models) { task = 'text'; await runInfo(prompt, log, signal); patch(id, { state: 'done', text: 'These are the models your connected providers offer right now.' }); return; }
      // Plain file jobs (zip, convert, merge, photos to PDF, "make that a PDF") are done right here: no model, no key, no catalog check.
      const local = flags.task ? null : detectLocal(text, atts, history);
      if (local) {
        task = 'text'; log.step('Building your file on this device…');
        const lr = log.start('cmd', `local ${local.kind} --to ${local.format}`);
        const out = await runLocal(local, atts); log.done(lr, `${out.file.name} · ${sizeLabel(out.file.blob.size)}`); log.say('ok', 'done');
        outFiles.set(id, out.file);
        patch(id, { state: 'done', kind: 'text', text: out.text, notes: out.notes.length ? out.notes : undefined, fileOut: { name: out.file.name, size: out.file.blob.size } });
        return;
      }
      const photos = atts.filter((a) => a.kind === 'image');
      const intent = interpret(text, { hasFiles: atts.length > 0, hasImageFile: photos.length > 0 });
      task = flags.task ?? intent.task;
      // A guess (not a clear request) falls back to the kind of model that is actually connected.
      if (!flags.task && !intent.explicit && (task === 'image' || task === 'video') && !defaultKeys(task).length && defaultKeys('text').length) task = 'text';

      if (task === 'text') {
        let last = 0;
        const out = await runText({ prompt, files: atts, history, prefer: flags.prefer ?? getSettings().priority, signal, log, onText: (t) => {
          partial = t; const now = Date.now(); if (now - last < 90) return; last = now; patch(id, { kind: 'text', text: t });
        } });
        if (out.file) outFiles.set(id, out.file);
        log.say('ok', 'done');
        patch(id, { state: 'done', kind: 'text', text: out.text, notes: out.notes.length ? out.notes : undefined, fileOut: out.file ? { name: out.file.name, size: out.file.blob.size } : undefined });
        return;
      }

      if (task === 'edit' && !photos.length) throw new Error('Attach the photo you want changed with the + button, then describe the change and send it again.');
      if (task === 'video') {
        const st = await runVideoStart({ prompt, modelId: 'auto', signal, log, left: remaining('video'), limit: FREE_LIMITS.video, premium: isPremium() });
        const jobId = uid();
        addJob({ id: jobId, provider: st.model.provider, keyId: st.keyId, model: st.model.id, op: st.op, prompt: st.prompt, aspect: st.aspect, createdAt: Date.now(), status: 'running' });
        logFor(jobId).step('Your video is rendering. This can take a few minutes…');
        patch(id, { jobId, kind: 'video', state: 'working', text: '', notes: [`Rendering with ${st.model.name}. You can keep chatting or leave this page.${atts.length ? ' Your attachment was not used: making a video from a photo is not available yet.' : ''}`] });
        return;
      }
      const res = await runImage({ prompt, count: 1, format: 'auto', prefer: getSettings().priority, model: 'auto', signal, log, left: remaining('image'), limit: FREE_LIMITS.image, premium: isPremium(), routed: true, refs: photos });
      log.step('Saving your image…');
      const sv = log.start('cmd', 'library.save'); const ids: string[] = [];
      for (const m of res.images) { const mid = uid(); await putMedia({ id: mid, projectId: null, kind: 'image', name: `${slug(res.prompt)}.${ext(m.mime)}`, mime: m.mime, size: m.blob.size, createdAt: Date.now(), blob: m.blob }); ids.push(mid); }
      record('image', res.images.length); log.done(sv, `${ids.length} saved on this device`); log.say('ok', 'done');
      patch(id, { state: 'done', kind: 'image', media: ids, text: [`Made with ${res.model.name}${photos.length ? ' from your photo' : ` at ${res.aspect}`}.`, ...res.notes].join(' ') });
    } catch (e) {
      log.settle('failed');
      const n = friendlyNote(e, { task, step: log.lastStep() });
      log.say(n.cancelled ? 'warn' : 'err', n.cancelled ? 'cancelled' : (e instanceof Error ? e.message : 'failed'));
      patch(id, { state: 'error', kind: task === 'text' ? 'text' : undefined, text: partial, note: n.text, providers: n.providers });
    } finally { abort.current = null; setActive(false); tick((n) => n + 1); }
  };

  /** Starts a request. With `replace`, the answer to an earlier message is redone in place instead of adding a new exchange. */
  const begin = (prompt: string, atts: Attachment[], replace?: { id: string; before: Msg[] }) => {
    const id = replace?.id ?? uid(); const log = new RunLog(); logs.set(id, log); outFiles.delete(id);
    const history = historyOf(replace ? replace.before : messages);
    if (replace) setMessages((ms) => ms.map((m) => (m.id === id ? { id, role: 'assistant', text: '', state: 'working' } : m)));
    else { const userId = uid(); sent.set(userId, atts); setMessages((ms) => [...ms, { id: userId, role: 'user', text: prompt, files: atts.map(meta) }, { id, role: 'assistant', text: '', state: 'working' }]); }
    setActive(true); void run(id, prompt, log, atts, history);
  };
  const send = (value = idea) => {
    const prompt = value.trim(); if ((!prompt && !files.length) || active) return;
    const atts = files; begin(prompt, atts);
    setIdea(''); setFiles([]); setFileNote(''); setMenu(false);
  };
  /** Regenerate / retry / resend: run the same request again where it stands. */
  const redo = (assistantId: string) => {
    if (active) return; const i = messages.findIndex((m) => m.id === assistantId); const u = messages[i - 1];
    if (i < 1 || u?.role !== 'user') return;
    const atts = sent.get(u.id) ?? [];
    if (u.files?.length && !atts.length) { setIdea(u.text); setFileNote('Those files are no longer in memory. Attach them again, then send.'); input.current?.focus(); return; }
    begin(u.text, atts, { id: assistantId, before: messages.slice(0, i - 1) });
  };
  const flash = (k: string) => { setCopied(k); setTimeout(() => setCopied((c) => (c === k ? '' : c)), 1500); };
  const copyText = (key: string, t: string) => { void navigator.clipboard?.writeText(t).then(() => flash(key)).catch(() => flash(`${key}!`)); };
  const download = async (m: Msg) => {
    const out = outFiles.get(m.id);
    if (out) { await platform.saveFile(out.blob, out.name); return; }
    if (m.media?.length) { for (const r of await recsFor(m.media)) await platform.saveFile(r.blob, r.name); return; }
    if (m.text) await platform.saveFile(new Blob([m.text], { type: 'text/markdown' }), `${slug(m.text.replace(/^#+\s*/, '').split('\n')[0]) || 'answer'}.md`);
  };
  const useAsReference = async (m: Msg) => {
    const recs = (await recsFor(m.media ?? [])).filter((r) => r.kind === 'image'); if (!recs.length) return;
    const { added } = toAttachments(recs.map((r) => new File([r.blob], r.name, { type: r.mime })), files); setFiles((f) => [...f, ...added]);
    setIdea((t) => t || 'Change '); input.current?.focus();
  };
  const editInEditor = async (m: Msg) => { const recs = await recsFor(m.media ?? []); setPicker({ extra: recs, preselect: recs.map((r) => r.id) }); };
  const newChat = () => { setMessages([]); setIdea(''); setFiles([]); setFileNote(''); outFiles.clear(); sent.clear(); thumbs.forEach((u) => URL.revokeObjectURL(u)); thumbs.clear(); };
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const track = [...prompts, ...prompts];
  const canSend = !!idea.trim() || files.length > 0;

  return (
    <section className={`chat-home${drag ? ' dragging' : ''}`} style={{ '--kb': `${lift}px` } as CSSProperties}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } setDrag(false); }}>
      <header className="chat-top">
        <div className="usage" aria-label="Usage left today">
          {premium ? <span>Premium · unlimited</span> : <><span><b>{imagesLeft}</b> images</span><i aria-hidden="true" /><span><b>{videosLeft}</b> videos</span><span className="muted"> left today</span></>}
        </div>
        {messages.length > 0 && <button className="chat-new" aria-label="New chat" title="New chat" onClick={newChat}><Icon name="newChat" size={18} /></button>}
      </header>

      <div className="chat-thread" ref={thread} aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <h2>What can I help you with?</h2>
            <p className="muted small">Ask, write, analyse a file, or describe an image or video.</p>
            {providerCount === 0 && <p className="muted small">Zipping, converting and merging files works without any key. When you want writing, images or video, <a href="#/providers">add an AI key</a>.</p>}
          </div>
        ) : messages.map((m) => m.role === 'user' ? (
          <div key={m.id} className="chat-message user">
            <div className="message-content">
              {(sent.get(m.id)?.length ?? m.files?.length ?? 0) > 0 && (
                <div className="msg-files">
                  {sent.get(m.id) ? sent.get(m.id)!.map((a) => <Chip key={a.id} a={a} />) : m.files!.map((f, i) => <span key={i} className="attach-chip"><span className="attach-glyph" aria-hidden="true">{GLYPH[f.kind] ?? 'FILE'}</span><span className="attach-name">{f.name}</span></span>)}
                </div>
              )}
              {m.text}
            </div>
            <div className="msg-actions">
              {m.text && <button className="ia" aria-label="Copy" title="Copy" onClick={() => copyText(m.id, m.text)}><Icon name={copied === m.id ? 'check' : 'copy'} size={16} /></button>}
              {m.text && <button className="ia" aria-label="Edit message" title="Edit" onClick={() => { setIdea(m.text); setFiles(sent.get(m.id) ?? []); input.current?.focus(); }}><Icon name="pencil" size={16} /></button>}
              <button className="ia" aria-label="Send again" title="Send again" disabled={active} onClick={() => { const i = messages.findIndex((x) => x.id === m.id); if (messages[i + 1]) redo(messages[i + 1].id); }}><Icon name="refresh" size={16} /></button>
              {(sent.get(m.id) ?? []).some((a) => recOf(a)) && <button className="ia" aria-label="Edit in Editor" title="Edit in Editor" onClick={() => { const extra = (sent.get(m.id) ?? []).map(recOf).filter((r): r is MediaRecord => !!r); setPicker({ extra, preselect: extra.map((r) => r.id) }); }}><Icon name="editor" size={16} /></button>}
            </div>
          </div>
        ) : (
          <div key={m.id} className="chat-message assistant">
            <div className="assistant-body">
              <Reply m={m} />
              {m.state === 'working' && <FadeStatus log={m.jobId ? logFor(m.jobId) : logs.get(m.id)} fallback={m.jobId ? 'Your video is rendering…' : 'Getting started…'} />}
              {m.media && m.media.length > 0 && <Media ids={m.media} />}
              {m.state !== 'working' && (
                <div className="msg-actions">
                  {m.kind === 'text' && m.text && <button className="ia" aria-label="Copy" title="Copy" onClick={() => copyText(m.id, m.text)}><Icon name={copied === m.id ? 'check' : 'copy'} size={16} /></button>}
                  {(m.media?.length || m.text) && m.state === 'done' && (outFiles.has(m.id)
                    ? <button className="primary file" aria-label={`Download ${outFiles.get(m.id)!.name}`} title={`Download ${outFiles.get(m.id)!.name}`} onClick={() => void download(m)}><Icon name={/\.zip$/i.test(outFiles.get(m.id)!.name) ? 'zip' : 'file'} size={16} /><span>{outFiles.get(m.id)!.name}</span></button>
                    : <button className="ia" aria-label={m.media?.length ? 'Download' : 'Save as file'} title={m.media?.length ? 'Download' : 'Save as file'} onClick={() => void download(m)}><Icon name="download" size={16} /></button>)}
                  {m.kind === 'image' && m.media?.length && m.state === 'done' && <button className="ia" aria-label="Edit this photo" title="Edit this photo" onClick={() => void useAsReference(m)}><Icon name="photoEdit" size={16} /></button>}
                  {m.media?.length && m.state === 'done' && <button className="ia" aria-label="Edit in Editor" title="Edit in Editor" onClick={() => void editInEditor(m)}><Icon name="editor" size={16} /></button>}
                  {m.kind === 'text' && m.state === 'done' && /length limit|cut short/.test((m.notes ?? []).join(' ')) && <button className="ia" aria-label="Continue" title="Continue where it stopped" disabled={active} onClick={() => send('Continue exactly where you stopped.')}><Icon name="continue" size={16} /></button>}
                  <button className="ia" aria-label={m.state === 'error' ? 'Try again' : 'Regenerate'} title={m.state === 'error' ? 'Try again' : 'Regenerate'} disabled={active} onClick={() => redo(m.id)}><Icon name="refresh" size={16} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-bottom">
        {!focused && !idea.trim() && !files.length && (
          <div className="marquee" aria-label="Suggested prompts">
            <div className="marquee-track">
              {track.map((p, i) => <button key={`${p}-${i}`} className="suggestion" tabIndex={i < prompts.length ? 0 : -1} aria-hidden={i >= prompts.length} onClick={() => { setIdea(p); input.current?.focus(); }}>{p}</button>)}
            </div>
          </div>
        )}
        {fileNote && <p className="attach-note" role="status">{fileNote}</p>}
        <div className="chat-composer">
          {files.length > 0 && (
            <div className="attach-row" aria-label="Attached files">
              {files.map((a) => <Chip key={a.id} a={a} onRemove={() => setFiles((f) => f.filter((x) => x.id !== a.id))} />)}
            </div>
          )}
          <div className="composer-row">
            <div className="plus-wrap" ref={plus}>
              <button className="plus-button" type="button" aria-label="Add photos, videos or files" aria-haspopup="menu" aria-expanded={menu} disabled={files.length >= MAX_FILES} onClick={() => setMenu((o) => !o)}><Icon name="plus" size={22} /></button>
              {menu && (
                <div className="plus-menu" role="menu">
                  <button role="menuitem" onClick={() => pick(mediaIn.current)}><b aria-hidden="true"><Icon name="image" size={18} /></b><span>Photos & videos<small>From your gallery</small></span></button>
                  <button role="menuitem" onClick={() => pick(fileIn.current)}><b aria-hidden="true"><Icon name="file" size={18} /></b><span>Files<small>PDF, Word, text, code, audio</small></span></button>
                  <button role="menuitem" onClick={() => { setMenu(false); const extra = files.map(recOf).filter((r): r is MediaRecord => !!r); setPicker({ extra, preselect: extra.map((r) => r.id) }); }}><b aria-hidden="true"><Icon name="editor" size={18} /></b><span>Edit in Editor<small>Pick media to edit</small></span></button>
                  {platform.kind === 'web' && coarse && <button role="menuitem" onClick={() => pick(camIn.current)}><b aria-hidden="true"><Icon name="camera" size={18} /></b><span>Take a photo<small>Use the camera</small></span></button>}
                </div>
              )}
              <input ref={mediaIn} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={fileIn} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            <textarea ref={input} value={idea} rows={1} maxLength={20000} enterKeyHint="send" placeholder={files.length ? 'Add a message about your files…' : 'Ask, write, or describe an image or video…'} aria-label="Message"
              onChange={(e) => setIdea(e.target.value)} onFocus={() => { setFocused(true); setTimeout(() => toEnd(), 250); }} onBlur={() => setFocused(false)}
              onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); send(); } }} />
            {active
              ? <button className="send-button stop" aria-label="Stop" onClick={() => abort.current?.abort()}><Icon name="stop" size={18} /></button>
              : <button className="send-button" aria-label="Send" disabled={!canSend} onClick={() => send()}><Icon name="send" size={20} /></button>}
          </div>
        </div>
      </div>
      {picker && <MediaPicker extra={picker.extra} preselect={picker.preselect} onClose={() => setPicker(null)} />}
    </section>
  );
}
