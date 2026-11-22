/** Text-model controls. Unknown slash commands remain in the prompt so they can be discussed. */
export interface Flags { prefer?: 'speed' | 'quality'; model?: string; models?: boolean; used: string[]; }
export const COMMAND_HELP = '/fast  /quality  /model <id>  /models';
export function parseCommands(input: string): { text: string; flags: Flags } {
  const flags: Flags = { used: [] }; const words = input.trim().split(/\s+/); const keep: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; const lw = w.toLowerCase(); if (!w.startsWith('/') || w.length < 2) { keep.push(w); continue; }
    const use = (label: string) => flags.used.push(label);
    if (lw === '/fast' || lw === '/speed') { flags.prefer = 'speed'; use('--fast'); }
    else if (lw === '/quality' || lw === '/best') { flags.prefer = 'quality'; use('--quality'); }
    else if (lw === '/model' && words[i + 1]) { flags.model = words[++i]; use(`--model ${flags.model}`); }
    else if (lw === '/models') { flags.models = true; use('models'); }
    else keep.push(w);
  }
  return { text: keep.join(' ').trim(), flags };
}
