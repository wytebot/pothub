export type TaskName = 'text' | 'image' | 'video' | 'edit';
export interface Note { text: string; /** show the "Open AI Providers" link */ providers?: boolean; /** nothing went wrong: the person stopped it */ cancelled?: boolean; }

const what: Record<TaskName, string> = { text: 'your answer', image: 'your image', video: 'your video', edit: 'your edit' };
const lower = (s?: string) => (s ? s.replace(/[….]+$/, '').replace(/^./, (c) => c.toLowerCase()) : '');

/**
 * Turns whatever went wrong into a short, kind note that says what happened, where it stopped and what to do next.
 * `step` is the last plain-language step the person saw, so the note can say "while choosing a model".
 */
export function friendlyNote(error: unknown, o: { task: TaskName; step?: string }): Note {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const status = (error as { status?: number } | undefined)?.status;
  const where = o.step ? ` while ${lower(o.step)}` : '';
  const w = what[o.task];
  if (raw === 'Cancelled.') return { text: 'Stopped. Nothing more will run for this one.', cancelled: true };
  if (/no .*model is available|add an api key|tick a .* key|needs a key|no default key|switched off|add a key/i.test(raw) || /AI Providers/.test(raw)) {
    const need = o.task === 'edit' ? 'Google Gemini image models' : o.task === 'text' ? 'a text model (Google Gemini, OpenAI or xAI)' : o.task === 'video' ? 'a video model (Google Gemini, OpenAI, Luma, Kling, fal.ai and others)' : 'an image model';
    const field = o.task === 'text' ? 'Text & documents' : o.task === 'video' ? 'Video' : 'Images';
    return { text: `I would love to make ${w}, but none of your connected keys can do that yet. Add a key that gives access to ${need} in AI Providers and tick it for ${field}, then send this again.`, providers: true };
  }
  if (/couldn't check which models|could not check which models/i.test(raw)) return { text: `I could not check which models your key can use right now${where}. This is usually a short connection hiccup. Try again in a moment.` };
  if (status === 401 || /rejected this key|invalid api key|incorrect api key/i.test(raw)) return { text: `Your provider did not accept the key${where}. Open AI Providers, check the key is correct and active, then try again.`, providers: true };
  if (status === 402 || /no credit left/i.test(raw)) return { text: `Your provider account has run out of credit${where}. Top it up with the provider, then send this again.`, providers: true };
  if (status === 429 || /rate limit|quota reached/i.test(raw)) return { text: `Your provider is asking for a short pause${where} (rate limit or quota). Wait a minute, or check your plan with the provider, then try again.` };
  if (/safety|blocked/i.test(raw)) return { text: `The provider declined this request on safety grounds${where}. Try rewording it a little and send it again.` };
  if (/free .*(left|limit)|daily free limit|free (image|video)/i.test(raw)) return { text: raw.replace(/^Daily free limit/, 'You have reached the daily free limit') };
  if (/took too long|timed out/i.test(raw)) return { text: `The provider took too long to answer${where}. Nothing is lost; try again in a moment.` };
  if (/could not reach|connection dropped|network|failed to fetch/i.test(raw)) return { text: `I lost the connection${where}. Check your internet and try again.` };
  if (typeof status === 'number' && status >= 500 || /having problems right now/i.test(raw)) return { text: `The provider is having a rough moment${where}. Try again shortly, or tick another provider as a default in AI Providers.` };
  if (/empty answer|returned no (image|text)/i.test(raw)) return { text: `The model came back empty-handed${where}. Try once more, or add a little more detail to the request.` };
  if (/could not open|cannot read|too large|too short|describe the|attach the photo|type your question|editing a photo needs/i.test(raw) && !/AI Providers/.test(raw)) return { text: raw };
  return { text: `Something did not go through${where}. ${raw && raw.length < 180 ? raw : `Please try again to get ${w}.`}`.replace(/\s+/g, ' ').trim() };
}
