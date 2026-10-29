/** Enforce a bounded prompt size before provider calls. */
export function boundPrompt(value, configuredLimit = 60000) {
  const limit = Math.max(12000, Math.min(90000, Number(configuredLimit) || 60000));
  return String(value ?? '').slice(0, limit);
}

/** Parse JSON-only or fenced JSON responses without accepting empty/non-object payloads. */
export function parseModelJson(value) {
  const text = String(value ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI returned an unreadable report. Try again with shorter logs.');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('AI response must be a JSON object.');
  return parsed;
}
