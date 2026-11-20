import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { announceChats, CHAT_OPEN, currentChatId, openChat, setCurrentChatId, titleFrom } from '../chat/state';
import type { ChatMessage as Msg } from '../chat/types';
import { getChat, putChat } from '../storage/db';
import { defaultKeys } from '../vault/vault';
import { FNS } from '../models/providerInfo';
import { uid } from '../storage/db';
import { RunLog } from '../agent/log';
import { FadeStatus } from '../ui/FadeStatus';
import { Sources } from '../ui/Sources';
import { nameFromText } from '../agent/fileNames';
import { Markdown } from '../ui/Markdown';
import { useOutside } from '../ui/useOutside';
import { runInfo, runText } from '../agent/workflow';
import { parseCommands } from '../agent/commands';
import { friendlyNote } from '../agent/friendly';
import { MAX_FILES, meta, sizeLabel, toAttachments, type Attachment } from '../agent/attachments';
import type { OutFile } from '../agent/deliver';
import type { ChatTurn } from '../models/text';
import { getSettings } from '../settings';
import { platform } from '../platform';
import { Icon } from '../ui/Icon';
import { detectLocal, runLocal } from '../agent/local';
import { takeCodelabPrompt } from '../codelab/context';

const OLD_KEY = 'chat.v3';
const PROMPTS = [
  'Write a detailed business plan for a small bakery in Lagos',
  'Explain how mortgages work, with worked examples',
  'Explain how to use responsive layouts and accessibility together',
  'Create a 7-day study plan for exam revision as a table',
  'Write a detailed launch plan for a small business',
  'Compare common frontend architecture patterns with examples',
  'Write a professional cover letter for a sales role as a Word document',
  'Draft a technical README for a new application',
  'Compare React and Vue for a small team, in a table',
  'Build a responsive dashboard with a clean design',
  'Summarise a long article into key points (attach it with +)',
  'Create a step-by-step debugging checklist for a failing build',
  'Design a database schema for a small inventory application',
];
const logs = new Map<string, RunLog>();
const outFiles = new Map<string, OutFile>();
const sent = new Map<string, Attachment[]>();
const GLYPH: Record<string, string> = { pdf: 'PDF', docx: 'DOC', text: 'TXT', office: 'DOC', archive: 'ZIP', binary: 'FILE' };

/** Messages as they come back from storage: files built last time are gone, and a request that was still running is checked against the job list. */
function revive(all: Msg[]): Msg[] {
  return all.map((m) => {
    if (m.fileOut) m = { ...m, fileOut: undefined }; // the built file only lives while the app is open
    if (m.state !== 'working') return m;
    return { ...m, state: 'error' as const, note: 'This request was interrupted. Send it again.' };
  });
}
/** The chat from before conversations were kept in IndexedDB. Moved over once, then removed. */
function takeLegacy(): Msg[] {
  try {
    const raw = localStorage.getItem(OLD_KEY) ?? localStorage.getItem('chat.v2'); if (!raw) return [];
    const all = JSON.parse(raw) as Msg[]; return Array.isArray(all) ? all : [];
  } catch { return []; }
}

/** Every answered question in this chat, so a follow-up like "make it shorter" has something to refer to. Only text answers count. */
function historyOf(ms: Msg[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i]; const u = ms[i - 1];
    if (a.role === 'assistant' && a.state === 'done' && a.text && u.role === 'user' && u.text) turns.push({ role: 'user', text: u.text }, { role: 'assistant', text: a.text });
  }
  // Keep all history in IndexedDB; send only a plan-aware recent window to the provider.
  const maxPairs = 8;
  return turns.slice(-maxPairs * 2);
}

function Chip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  return (
    <span className="attach-chip" title={`${a.name} · ${sizeLabel(a.size)}`}>
      <span className="attach-glyph" aria-hidden="true">{GLYPH[a.kind] ?? 'FILE'}</span>
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
      <Sources sources={m.sources} />
    </>
  );
}

export function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [ready, setReady] = useState(false);

  const idRef = useRef('');
  const created = useRef(0);
  const fromLoad = useRef<Msg[] | null>(null);
  const flush = useRef<(() => void) | null>(null);
  const [idea, setIdea] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileNote, setFileNote] = useState('');
  const [editing, setEditing] = useState<{ userId: string; assistantId: string; before: Msg[] } | null>(null);
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState('');
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [lift, setLift] = useState(0);
  const [, tick] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const plus = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const prompts = useMemo(() => [...PROMPTS].sort(() => Math.random() - 0.5), []);
  const providerCount = new Set(FNS.flatMap((f) => defaultKeys(f).map((k) => k.provider))).size;

  const closeMenu = useCallback(() => setMenu(false), []);
  useOutside(plus, menu, closeMenu);

  // ---- conversations live in IndexedDB: no size cap, and every chat stays in the History menu ----
  const loadChat = useCallback(async (id: string) => {
    let msgs: Msg[] = []; let cid = id; created.current = 0;
    try {
      const c = id ? await getChat(id) : undefined;
      if (c) { msgs = revive(c.messages); created.current = c.createdAt; }
      else if (id) cid = ''; // the pointer led to a chat that no longer exists
      else {
        const legacy = takeLegacy();
        if (legacy.length) {
          cid = uid(); const now = Date.now(); const first = legacy.find((m) => m.role === 'user');
          await putChat({ id: cid, title: titleFrom(first?.text ?? ''), createdAt: now, updatedAt: now, messages: legacy });
          try { localStorage.removeItem(OLD_KEY); localStorage.removeItem('chat.v2'); } catch { /* storage blocked */ }
          msgs = revive(legacy); created.current = now; announceChats();
        }
      }
    } catch { msgs = []; cid = ''; }
    idRef.current = cid; setCurrentChatId(cid); fromLoad.current = msgs; setMessages(msgs); setReady(true);
  }, []);
  useEffect(() => { void loadChat(currentChatId()); }, [loadChat]);
  useEffect(() => { const prompt = takeCodelabPrompt(); if(prompt) { setIdea(prompt); setFiles([]); } }, []);
  useEffect(() => {
    const f = (e: Event) => {
      abort.current?.abort();
      outFiles.clear(); sent.clear();
      setIdea(''); setFiles([]); setFileNote(''); setMenu(false);
      void loadChat((e as CustomEvent<{ id: string | null }>).detail?.id ?? '');
    };
    window.addEventListener(CHAT_OPEN, f); return () => window.removeEventListener(CHAT_OPEN, f);
  }, [loadChat]);

  useEffect(() => {
    if (!ready || !messages.length || messages === fromLoad.current) return;
    const id = idRef.current; if (!id) return;
    const save = () => {
      flush.current = null;
      const first = messages.find((m) => m.role === 'user'); const now = Date.now();
      void putChat({ id, title: titleFrom(first?.text || first?.files?.[0]?.name || ''), createdAt: created.current || now, updatedAt: now, messages: messages.map((m) => (m.fileOut ? { ...m, fileOut: undefined } : m)) }).then(() => announceChats()).catch(() => {});
    };
    flush.current = save; const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [messages, ready]);
  // Leaving the page or the app must not lose the last few seconds.
  useEffect(() => {
    const f = () => flush.current?.();
    const v = () => { if (document.visibilityState === 'hidden') f(); };
    document.addEventListener('visibilitychange', v); window.addEventListener('pagehide', f);
    return () => { document.removeEventListener('visibilitychange', v); window.removeEventListener('pagehide', f); f(); };
  }, []);

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
    // Free accounts have a limited number of attachments per 5 hours; only that many files go in, and the person is told when the rest can come back.
    const room = Math.max(0, MAX_FILES - files.length);
    const { added, skipped } = toAttachments(picked.slice(0, room), files);
    if (added.length) setFiles((f) => [...f, ...added]);
    setFileNote(skipped.length ? `${skipped.slice(0, 2).join('. ')}${skipped.length > 2 ? ` (and ${skipped.length - 2} more)` : ''}.` : '');
    setMenu(false); input.current?.focus();
  };
  useEffect(() => { if (!fileNote) return; const t = setTimeout(() => setFileNote(''), 7000); return () => clearTimeout(t); }, [fileNote]);
  const pick = (el: HTMLInputElement | null) => { setMenu(false); if (el) { el.value = ''; el.click(); } };

  const run = async (id: string, prompt: string, log: RunLog, atts: Attachment[], history: ChatTurn[]) => {
    const ctl = new AbortController(); abort.current = ctl; const signal = ctl.signal;
    let partial = '';
    try {
      const { text, flags } = parseCommands(prompt);
      if (flags.models) { await runInfo(prompt, log, signal); patch(id, { state: 'done', text: 'These are the models your connected providers offer right now.' }); return; }
      // Local text/document jobs (zip, convert, merge, "make that a PDF") are handled here: no model, no key, no catalog check.
      const local = detectLocal(text, atts, history);
      if (local) {
        log.step('Building your file on this device…');
        const lr = log.start('cmd', `local ${local.kind} --to ${local.format}`);
        const out = await runLocal(local, atts); log.done(lr, `${out.file.name} · ${sizeLabel(out.file.blob.size)}`); log.say('ok', 'done');
        outFiles.set(id, out.file);
        patch(id, { state: 'done', kind: 'text', text: out.text, notes: out.notes.length ? out.notes : undefined, fileOut: { name: out.file.name, size: out.file.blob.size } });
        return;
      }
      // Text-only routing: every prompt is handled by a text model, including legacy media prompts.
      let last = 0;
      const out = await runText({ prompt, files: atts, web: true, history, prefer: flags.prefer ?? getSettings().priority, signal, log, onText: (t) => {
        partial = t; const now = Date.now(); if (now - last < 90) return; last = now; patch(id, { kind: 'text', text: t });
      }});
      if (out.file) outFiles.set(id, out.file);
      log.say('ok', 'done');
      patch(id, { state: 'done', kind: 'text', text: out.text, notes: out.notes.length ? out.notes : undefined, sources: out.sources?.length ? out.sources : undefined, fileOut: out.file ? { name: out.file.name, size: out.file.blob.size } : undefined });
      return;
    } catch (e) {
      log.settle('failed');
      const n = friendlyNote(e, { task: 'text', step: log.lastStep() });
      log.say(n.cancelled ? 'warn' : 'err', n.cancelled ? 'cancelled' : (e instanceof Error ? e.message : 'failed'));
      patch(id, { state: 'error', kind: 'text', text: partial, note: n.text, providers: n.providers });
    } finally { abort.current = null; setActive(false); tick((n) => n + 1); }
  };

  /** Starts a request. With `replace`, the answer to an earlier message is redone in place instead of adding a new exchange. */
  const begin = (prompt: string, atts: Attachment[], replace?: { id: string; before: Msg[]; userId?: string }) => {
    const id = replace?.id ?? uid(); const log = new RunLog(); logs.set(id, log); outFiles.delete(id);
    const history = historyOf(replace ? replace.before : messages);
    if (replace) {
      if (replace.userId) { sent.set(replace.userId, atts); setMessages((ms) => ms.map((m) => m.id === replace.userId ? { ...m, text: prompt, files: atts.map(meta) } : m.id === id ? { id, role: 'assistant', text: '', state: 'working' } : m)); }
      else setMessages((ms) => ms.map((m) => (m.id === id ? { id, role: 'assistant', text: '', state: 'working' } : m)));
    }
    else { if (!idRef.current) { idRef.current = uid(); created.current = Date.now(); setCurrentChatId(idRef.current); } const userId = uid(); sent.set(userId, atts); setMessages((ms) => [...ms, { id: userId, role: 'user', text: prompt, files: atts.map(meta) }, { id, role: 'assistant', text: '', state: 'working' }]); }
    setActive(true); void run(id, prompt, log, atts, history);
  };
  const send = (value = idea) => {
    const prompt = value.trim(); if ((!prompt && !files.length) || active) return;
    const atts = files;
    if (editing) { begin(prompt, atts, { id: editing.assistantId, before: editing.before, userId: editing.userId }); setEditing(null); }
    else begin(prompt, atts);
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
    if (m.text) await platform.saveFile(new Blob([m.text], { type: 'text/markdown' }), `${nameFromText(m.text)}.md`);
  };
  const newChat = () => openChat(null);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const track = [...prompts, ...prompts];
  const canSend = !!idea.trim() || files.length > 0;

  return (
    <section className={`chat-home${drag ? ' dragging' : ''}`} style={{ '--kb': `${lift}px` } as CSSProperties}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } setDrag(false); }}>
      <header className="chat-top">
        <div className="usage"><span className="muted">{messages.length ? 'Chat' : 'New chat'}</span></div>
        {messages.length > 0 && <button className="chat-new" aria-label="New chat" title="New chat" onClick={newChat}><Icon name="newChat" size={18} /></button>}
      </header>

      <div className="chat-thread" ref={thread} aria-live="polite">
        {!ready ? null : messages.length === 0 ? (
          <div className="chat-empty">
            <h2>What can I help you with?</h2>
            <p className="muted small">Ask, write, research, code or analyse a document.</p>
            {providerCount === 0 && <p className="muted small">File conversion works without any key. When you want writing or research, <a href="#/providers">add an AI key</a>.</p>}
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
              {m.text && <button className="ia" aria-label="Edit message" title="Edit" onClick={() => { const i = messages.findIndex((x) => x.id === m.id); const next = messages[i + 1]; if (next?.role === 'assistant') setEditing({ userId: m.id, assistantId: next.id, before: messages.slice(0, i) }); setIdea(m.text); setFiles(sent.get(m.id) ?? []); input.current?.focus(); }}><Icon name="pencil" size={16} /></button>}
              <button className="ia" aria-label="Send again" title="Send again" disabled={active} onClick={() => { const i = messages.findIndex((x) => x.id === m.id); if (messages[i + 1]) redo(messages[i + 1].id); }}><Icon name="refresh" size={16} /></button>
            </div>
          </div>
        ) : (
          <div key={m.id} className="chat-message assistant">
            <div className="assistant-body">
              <Reply m={m} />
              {m.state === 'working' && <FadeStatus log={logs.get(m.id)} fallback={'Getting started…'} />}
              {m.state !== 'working' && (
                <div className="msg-actions">
                  {m.kind === 'text' && m.text && <button className="ia" aria-label="Copy" title="Copy" onClick={() => copyText(m.id, m.text)}><Icon name={copied === m.id ? 'check' : 'copy'} size={16} /></button>}
                  {m.text && m.state === 'done' && (outFiles.has(m.id)
                    ? <button className="primary file" aria-label={`Download ${outFiles.get(m.id)!.name}`} title={`Download ${outFiles.get(m.id)!.name}`} onClick={() => void download(m)}><Icon name={/\.zip$/i.test(outFiles.get(m.id)!.name) ? 'zip' : 'file'} size={16} /><span>{outFiles.get(m.id)!.name}</span></button>
                    : <button className="ia" aria-label={'Save as file'} title={'Save as file'} onClick={() => void download(m)}><Icon name="download" size={16} /></button>)}
                  {m.kind === 'text' && m.state === 'done' && /length limit|cut short/.test((m.notes ?? []).join(' ')) && <button className="ia" aria-label="Continue" title="Continue where it stopped" disabled={active} onClick={() => send('Continue exactly where you stopped.')}><Icon name="continue" size={16} /></button>}
                  <button className="ia" aria-label={m.state === 'error' ? 'Try again' : 'Regenerate'} title={m.state === 'error' ? 'Try again' : 'Regenerate'} disabled={active} onClick={() => redo(m.id)}><Icon name="refresh" size={16} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-bottom">
        {ready && messages.length === 0 && !focused && !idea.trim() && !files.length && (
          <div className="marquee" aria-label="Suggested prompts">
            <div className="marquee-track">
              {track.map((p, i) => <button key={`${p}-${i}`} className="suggestion" tabIndex={i < prompts.length ? 0 : -1} aria-hidden={i >= prompts.length} onClick={() => { setIdea(p); input.current?.focus(); }}>{p}</button>)}
            </div>
          </div>
        )}
        {editing && <div className="notice" role="status">Editing this request. Sending will update its existing reply instead of adding a new conversation entry. <button className="btn" onClick={() => { setEditing(null); setIdea(''); setFiles([]); }}>Cancel edit</button></div>}
        {fileNote && <p className="attach-note" role="status">{fileNote}</p>}
        <div className="chat-composer">
          {files.length > 0 && (
            <div className="attach-row" aria-label="Attached files">
              {files.map((a) => <Chip key={a.id} a={a} onRemove={() => setFiles((f) => f.filter((x) => x.id !== a.id))} />)}
            </div>
          )}
          <div className="composer-row">
            <div className="plus-wrap" ref={plus}>
              <button className="plus-button" type="button" aria-label="Attach text or documents" aria-haspopup="menu" aria-expanded={menu} disabled={files.length >= MAX_FILES} onClick={() => setMenu((o) => !o)}><Icon name="plus" size={22} /></button>
              {menu && (
                <div className="plus-menu" role="menu">
                  <button role="menuitem" onClick={() => pick(fileIn.current)}><b aria-hidden="true"><Icon name="file" size={18} /></b><span>Attach files<small>Code, text and documents</small></span></button>
                  <button role="menuitem" onClick={() => { setIdea((v) => `${v ? `${v}\n\n` : ''}Research this thoroughly using current web sources. Compare reliable sources, verify key claims, include dates and cite every factual claim.`); setMenu(false); input.current?.focus(); }}><b aria-hidden="true"><Icon name="search" size={18} /></b><span>Deep research<small>Search, verify and cite sources</small></span></button>
                  <button role="menuitem" onClick={() => { setIdea((v) => `${v ? `${v}\n\n` : ''}Act as a senior software engineer. Inspect all relevant context, plan first, solve root causes, deliver complete working code for every changed file, include setup commands and explain decisions. Do not omit or truncate code.`); setMenu(false); input.current?.focus(); }}><b aria-hidden="true"><Icon name="code" size={18} /></b><span>Developer mode<small>Complete code, tests and explanations</small></span></button>
                  <button role="menuitem" onClick={() => { setIdea((v) => `${v ? `${v}\n\n` : ''}Create a complete downloadable document. Choose the most suitable file format, include the full content, validate the structure and avoid placeholders.`); setMenu(false); input.current?.focus(); }}><b aria-hidden="true"><Icon name="file-text" size={18} /></b><span>Create a file<small>Document, code or structured data</small></span></button>
                  <a role="menuitem" href="#/codelab" onClick={() => setMenu(false)}><b aria-hidden="true"><Icon name="git-branch" size={18} /></b><span>Codelab<small>Edit and commit GitHub projects</small></span></a>
                </div>
              )}
              <input ref={fileIn} type="file" accept="*/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            <textarea ref={input} value={idea} rows={1} enterKeyHint="send" placeholder={files.length ? 'Add a message about your files…' : 'Ask, write, research or code…'} aria-label="Message"
              onChange={(e) => setIdea(e.target.value)} onFocus={() => { setFocused(true); setTimeout(() => toEnd(), 250); }} onBlur={() => setFocused(false)}
              onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); send(); } }} />
            {active
              ? <button className="send-button stop" aria-label="Stop" onClick={() => abort.current?.abort()}><Icon name="stop" size={18} /></button>
              : <button className="send-button" aria-label="Send" disabled={!canSend} onClick={() => send()}><Icon name="send" size={20} /></button>}
          </div>
        </div>
      </div>
          </section>
  );
}
