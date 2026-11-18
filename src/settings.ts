export interface Settings { /** 'auto' lets Pothub choose; otherwise a text model id to use first */ textModel: string; imageModel: string; videoModel: string; priority: 'quality' | 'speed'; /** rewrite prompts with a fast Gemini text model before generating */ enhance: boolean; /** show the live step-by-step terminal during runs */ terminal: boolean; }
const KEY = 'settings'; const DEFAULTS: Settings = { textModel: 'auto', imageModel: 'auto', videoModel: 'auto', priority: 'quality', enhance: false, terminal: true };
export const getSettings = (): Settings => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; } };
export const saveSettings = (s: Settings) => localStorage.setItem(KEY, JSON.stringify(s));
