import { useEffect, useRef, useState } from 'react';
import { FREE_LIMITS, isPremium, remaining, usage } from '../quota/daily';
import { listKeys } from '../vault/vault';
import { interpret } from '../models/router';
import { parseCommands } from '../agent/commands';

type Message = { id: string; role: 'user' | 'assistant'; text: string };
const PROMPTS = [
  'Create a cinematic product photo of a luxury wristwatch',
  'Generate a 10-second cinematic video of Lagos at night',
  'Make a clean editorial portrait in soft studio lighting',
  'Create a vertical social media advert for a skincare brand',
  'Design a futuristic city skyline at golden hour',
];
const readMessages = (): Message[] => { try { return JSON.parse(sessionStorage.getItem('chat.messages') ?? '[]'); } catch { return []; } };

export function Home() {
  const [messages, setMessages] = useState<Message[]>(readMessages);
  const [idea, setIdea] = useState('');
  const [working, setWorking] = useState(false);
  const [step, setStep] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const u = usage();
  const providerCount = new Set(listKeys().filter((k) => k.status !== 'invalid').map((k) => k.provider)).size;
  const send = (value = idea) => {
    const prompt = value.trim(); if (!prompt || working) return;
    const next = [...messages, { id: `${Date.now()}`, role: 'user' as const, text: prompt }];
    setMessages(next); sessionStorage.setItem('chat.messages', JSON.stringify(next));
    setIdea(''); setWorking(true); setStep('Reading your request…');
    const { flags, text } = parseCommands(prompt);
    const plan = interpret(text);
    const task = flags.task ?? plan.task;
    sessionStorage.setItem('studio.prompt', prompt);
    sessionStorage.setItem('studio.chatRequest', '1');
    setStep('Checking available models and provider keys…');
    window.setTimeout(() => { location.hash = task === 'video' ? '/video' : '/image'; }, 320);
  };
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 176)}px`; }, [idea]);
  const leftImage = isPremium() ? 'Unlimited' : `${remaining('image')} images`;
  const leftVideo = isPremium() ? 'Unlimited' : `${remaining('video')} videos`;
  return (
    <section className="chat-home">
      <header className="chat-topline">
        <div><h1>What can I create?</h1><p className="muted small">{leftImage} · {leftVideo} left today</p></div>
        <a className="usage-pill" href="#/billing">{isPremium() ? 'Premium' : `${Math.max(0, FREE_LIMITS.image - u.image)} image uses`}</a>
      </header>
      <div className="chat-thread" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-mark">✳</div>
            <h2>Bring an idea to life</h2>
            <p className="muted">Describe what you want to create. Pothub will choose an available model.</p>
          </div>
        ) : messages.map((m) => <div key={m.id} className={`chat-message ${m.role}`}><div className="message-content">{m.text}</div></div>)}
        {working && <div className="chat-status"><span className="spin" />{step}</div>}
      </div>
      {!idea.trim() && messages.length === 0 && <div className="prompt-suggestions" aria-label="Suggested prompts">{PROMPTS.map((p) => <button key={p} className="suggestion" onClick={() => { setIdea(p); input.current?.focus(); }}>{p}</button>)}</div>}
      {!idea.trim() && messages.length > 0 && <div className="prompt-suggestions compact" aria-label="Suggested prompts">{PROMPTS.slice(0, 3).map((p) => <button key={p} className="suggestion" onClick={() => send(p)}>{p}</button>)}</div>}
      <div className="chat-composer-wrap">
        <div className="chat-composer">
          <textarea ref={input} value={idea} rows={1} maxLength={4000} placeholder="Describe an image or video…" onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="send-button" aria-label="Create" disabled={!idea.trim() || working} onClick={() => send()}><span>↑</span></button>
        </div>
        <div className="composer-foot"><span>{providerCount ? `${providerCount} provider${providerCount === 1 ? '' : 's'} connected` : 'Connect an AI provider to begin'}</span><a href="#/providers">Manage models</a></div>
      </div>
    </section>
  );
}
