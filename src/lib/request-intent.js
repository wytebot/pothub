/** Conservative intent routing: only explicit creation commands are sent to media agents. */
export function inferRequestedTask(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'chat';
  const prefix = '(?:please\\s+|can you\\s+|could you\\s+|i want you to\\s+|help me\\s+)?';
  const imageAction = new RegExp(`^${prefix}(?:generate|create|make|draw|render|produce)\\b.{0,70}\\b(?:image|picture|photo|portrait|illustration|artwork|wallpaper|thumbnail|logo|icon)\\b`);
  if (imageAction.test(text) || /^(?:image|picture|photo|illustration)\\s+(?:of|showing)\\b/.test(text)) return 'image';
  const videoAction = new RegExp(`^${prefix}(?:generate|create|make|render|produce)\\b.{0,70}\\b(?:video|clip|animation)\\b`);
  if (videoAction.test(text) || /^(?:video|clip|animation)\\s+(?:of|showing)\\b/.test(text)) return 'video';
  return 'chat';
}
