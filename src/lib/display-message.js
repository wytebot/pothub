/** Remove deployment addresses and raw URLs from user-facing dialogs/toasts. */
export function cleanDisplayMessage(value) {
  let message = String(value ?? 'Something went wrong. Try again.');
  message = message
    .replace(/https?:\/\/[^\s)'"<>]+/gi, 'the service')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:vercel\.app|netlify\.app|herokuapp\.com|firebaseapp\.com|web\.app)\b/gi, 'the service')
    .replace(/\bpothub-self\.vercel\.app\b/gi, 'the service')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return message.slice(0, 500) || 'Something went wrong. Try again.';
}
