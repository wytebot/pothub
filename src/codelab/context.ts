let pending: { prompt: string } | null = null;
export function setCodelabPrompt(prompt: string) { pending = { prompt }; }
export function takeCodelabPrompt() { const p = pending; pending = null; return p?.prompt ?? null; }
