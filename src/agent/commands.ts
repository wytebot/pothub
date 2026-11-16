/** Slash commands typed inside the prompt, e.g. "/fast /9:16 /n 3 a neon fox". They are removed from the text sent to the model. */
export interface Flags { prefer?: 'speed' | 'quality'; aspect?: string; count?: number; model?: string; task?: 'image' | 'video'; models?: boolean; enhance?: boolean; plain?: boolean; used: string[]; }
export const COMMAND_HELP = '/fast  /quality  /9:16 (any ratio)  /n 3  /model <id>  /image  /video  /enhance  /plain  /models';

export function parseCommands(input: string): { text: string; flags: Flags } {
  const flags: Flags = { used: [] }; const words = input.trim().split(/\s+/); const keep: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; const lw = w.toLowerCase();
    if (!w.startsWith('/') || w.length < 2) { keep.push(w); continue; }
    const use = (label: string) => flags.used.push(label);
    if (lw === '/fast' || lw === '/speed') { flags.prefer = 'speed'; use('--fast'); }
    else if (lw === '/quality' || lw === '/best') { flags.prefer = 'quality'; use('--quality'); }
    else if (/^\/\d{1,2}:\d{1,2}$/.test(lw)) { flags.aspect = lw.slice(1); use(`--aspect ${lw.slice(1)}`); }
    else if (lw === '/n' && /^\d$/.test(words[i + 1] ?? '')) { flags.count = Math.min(4, Math.max(1, Number(words[++i]))); use(`--n ${flags.count}`); }
    else if (/^\/n\d$/.test(lw)) { flags.count = Math.min(4, Math.max(1, Number(lw.slice(2)))); use(`--n ${flags.count}`); }
    else if (lw === '/model' && words[i + 1]) { flags.model = words[++i]; use(`--model ${flags.model}`); }
    else if (lw === '/image') { flags.task = 'image'; use('--task image'); }
    else if (lw === '/video') { flags.task = 'video'; use('--task video'); }
    else if (lw === '/models') { flags.models = true; use('models'); }
    else if (lw === '/enhance') { flags.enhance = true; use('--enhance'); }
    else if (lw === '/plain') { flags.plain = true; use('--plain'); }
    else keep.push(w); // unknown "/something" (a path, "and/or", ...) stays in the prompt
  }
  return { text: keep.join(' ').trim(), flags };
}
