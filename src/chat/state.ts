import { deleteChat, getChat } from '../storage/db';

/** Which conversation is open. Kept in localStorage (a tiny pointer); the conversations themselves live in IndexedDB. */
const CUR = 'chat.current.v1';
export const currentChatId = (): string => { try { return localStorage.getItem(CUR) ?? ''; } catch { return ''; } };
export const setCurrentChatId = (id: string) => { try { if (id) localStorage.setItem(CUR, id); else localStorage.removeItem(CUR); } catch { /* storage blocked */ } };

export const CHATS_CHANGED = 'chats:changed';
export const CHAT_OPEN = 'chat:open';
export const announceChats = () => window.dispatchEvent(new Event(CHATS_CHANGED));

/** Opens a conversation (or a blank one for null) in the chat page, whether it is on screen yet or not. */
export function openChat(id: string | null) {
  setCurrentChatId(id ?? '');
  window.dispatchEvent(new CustomEvent(CHAT_OPEN, { detail: { id } }));
  if ((location.hash.slice(1) || '/') !== '/') location.hash = '/';
}

export async function removeChat(id: string) {
  const wasOpen = currentChatId() === id;
  if (!(await getChat(id))) return;
  await deleteChat(id);
  if (wasOpen) openChat(null);
  announceChats();
}

export const titleFrom = (text: string, fallback = 'New chat') => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? (t.length > 60 ? `${t.slice(0, 59)}…` : t) : fallback;
};
