// Repositories tagged in the Ask MonyGist composer. A tag is either "once" (gone after the message is sent) or "keep" (stays until cancelled or changed).
export type TagMode = 'once' | 'keep';
export interface Tag { repo: string; mode: TagMode; /** Temporary branch override for failure/build context; not persisted in kept tags. */ branch?: string }
const KEY = 'pothub.repo.tags.v1';

export function loadKept(): Tag[] {
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Tag[]; return Array.isArray(j) ? j.filter((t) => typeof t?.repo === 'string' && t.mode === 'keep').slice(0, 3) : []; } catch { return []; }
}
export function saveKept(tags: Tag[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(tags.filter((t) => t.mode === 'keep').map(t=>({repo:t.repo,mode:t.mode})))); } catch { /* storage blocked */ }
}

/** Ticking a box sets that mode for the repository; ticking the box that is already on removes the tag. */
export function toggleTag(tags: Tag[], repo: string, mode: TagMode): Tag[] {
  const cur = tags.find((t) => t.repo === repo);
  if (cur?.mode === mode) return tags.filter((t) => t.repo !== repo);
  if (cur) return tags.map((t) => (t.repo === repo ? { repo, mode } : t));
  return [...tags, { repo, mode }].slice(-3);
}
/** What is left in the composer after a message has been sent. */
export const afterSend = (tags: Tag[]): Tag[] => tags.filter((t) => t.mode === 'keep');

/** The "@query" being typed at the caret, if any. */
export function atQuery(text: string, caret: number): { query: string; start: number; end: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|\s)@([\w./-]*)$/);
  if (!m) return null;
  const end = caret; const start = end - m[1].length - 1;
  return { query: m[1], start, end };
}
