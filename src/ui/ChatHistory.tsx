import { useCallback, useEffect, useState } from 'react';
import { listChats, type ChatRecord } from '../storage/db';
import { CHATS_CHANGED, CHAT_OPEN, currentChatId, openChat, removeChat } from '../chat/state';
import { Icon } from './Icon';

/** Every saved conversation, under the menu items. Collapsible, and the list scrolls inside its own small box so the menu never grows. */
export function ChatHistory({ onPick }: { onPick: () => void }) {
  const [open, setOpen] = useState(() => localStorage.getItem('ui.history') !== '0');
  const [items, setItems] = useState<ChatRecord[]>([]);
  const [cur, setCur] = useState(currentChatId());
  const refresh = useCallback(() => { void listChats().then(setItems).catch(() => {}); setCur(currentChatId()); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(CHATS_CHANGED, refresh); window.addEventListener(CHAT_OPEN, refresh);
    return () => { window.removeEventListener(CHATS_CHANGED, refresh); window.removeEventListener(CHAT_OPEN, refresh); };
  }, [refresh]);

  const toggle = () => setOpen((o) => { try { localStorage.setItem('ui.history', o ? '0' : '1'); } catch { /* storage blocked */ } return !o; });
  return (
    <div className="history" aria-label="Chat history">
      <div className="history-head">
        <button type="button" className="nav-link history-toggle" aria-expanded={open} aria-controls="history-list" onClick={toggle}>
          <span className={`chev${open ? ' up' : ''}`}><Icon name="chevron" size={16} /></span>History{items.length > 0 && <span className="history-count">{items.length}</span>}
        </button>
        <button type="button" className="icon-btn history-new" aria-label="New chat" title="New chat" onClick={() => { openChat(null); onPick(); }}><Icon name="plus" size={18} /></button>
      </div>
      {open && (items.length === 0
        ? <p className="muted small history-empty">Your chats will appear here.</p>
        : <ul className="history-list" id="history-list">
          {items.map((c) => (
            <li key={c.id} className={`history-row${c.id === cur ? ' current' : ''}`}>
              <button type="button" className="history-item" title={c.title} aria-current={c.id === cur ? 'true' : undefined} onClick={() => { openChat(c.id); onPick(); }}>{c.title || 'New chat'}</button>
              <button type="button" className="history-del" aria-label={`Delete chat: ${c.title}`} title="Delete" onClick={() => { if (window.confirm('Delete this chat? This cannot be undone.')) void removeChat(c.id); }}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ul>)}
    </div>
  );
}
