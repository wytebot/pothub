export type TaskName = 'text';
export interface Note { text: string; providers?: boolean; cancelled?: boolean; }
const lower = (s?: string) => (s ? s.replace(/[….]+$/, '').replace(/^./, (c) => c.toLowerCase()) : '');
export function friendlyNote(error: unknown, o: { task: TaskName; step?: string }): Note {
  const raw = error instanceof Error ? error.message : String(error ?? ''); const status = (error as { status?: number } | undefined)?.status; const where = o.step ? ` while ${lower(o.step)}` : '';
  if (raw === 'Cancelled.') return { text: 'Stopped. Nothing more will run for this one.', cancelled: true };
  if (/no .*model is available|add an api key|tick a .* key|needs a key|no default key|switched off|add a key/i.test(raw) || /AI Providers/.test(raw)) return { text: 'I could not answer because no text-model key is enabled. Add a key for OpenAI, Google Gemini or xAI under AI Providers, tick it for Text & documents, then try again.', providers: true };
  if (/couldn't check which models|could not check which models/i.test(raw)) return { text: `I couldn't check the available text models${where}. Try again in a moment.` };
  if (status === 401 || /rejected this key|invalid api key|incorrect api key/i.test(raw)) return { text: `Your provider did not accept the key${where}. Open AI Providers, check the key is correct and active, then try again.`, providers: true };
  if (status === 402 || /no credit left/i.test(raw)) return { text: `Your provider account has run out of credit${where}. Top it up with the provider, then send this again.`, providers: true };
  if (status === 429 || /rate limit|quota reached/i.test(raw)) return { text: `Your provider is asking for a short pause${where} (rate limit or quota). Wait a minute, or check your plan with the provider, then try again.` };
  if (/safety|blocked/i.test(raw)) return { text: `The provider declined this request on safety grounds${where}. Try rewording it and send it again.` };
  if (/took too long|timed out/i.test(raw)) return { text: `The provider took too long to answer${where}. Nothing is lost; try again in a moment.` };
  if (/could not reach|connection dropped|network|failed to fetch/i.test(raw)) return { text: `I lost the connection${where}. Check your internet and try again.` };
  if ((typeof status === 'number' && status >= 500) || /having problems right now/i.test(raw)) return { text: `The provider is having a rough moment${where}. Try again shortly, or tick another provider as a default in AI Providers.` };
  if (/empty answer|returned no text/i.test(raw)) return { text: `The model came back empty-handed${where}. Try once more, or add a little more detail to the request.` };
  if (/could not open|cannot read|too large|too short|type your question/i.test(raw)) return { text: raw };
  return { text: `Sorry, I couldn't complete your answer${where}. ${raw && raw.length < 180 ? raw : 'The provider or connection did not complete the request. Try a more specific prompt or check your provider key and connection.'}`.replace(/\s+/g, ' ').trim() };
}
