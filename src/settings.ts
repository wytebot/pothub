export interface Settings { textModel: string; priority: 'quality' | 'speed'; terminal: boolean; }
const KEY = 'settings'; const DEFAULTS: Settings = { textModel: 'auto', priority: 'quality', terminal: true };
export const getSettings = (): Settings => { try { const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>; return { textModel: typeof raw.textModel === 'string' ? raw.textModel : DEFAULTS.textModel, priority: raw.priority === 'speed' ? 'speed' : 'quality', terminal: raw.terminal !== false }; } catch { return DEFAULTS; } };
export const saveSettings = (s: Settings) => localStorage.setItem(KEY, JSON.stringify(s));
