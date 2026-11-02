/** Remove deployment addresses and raw URLs from user-facing dialogs/toasts. */
export function cleanDisplayMessage(value) {
  let message = String(value ?? 'Something went wrong. Try again.');
  message = message
    .replace(/modelsForFunction is not defined/gi, 'The model list could not be loaded. Refresh API & Agents and try again.')
    .replace(/ReferenceError:|TypeError:|SyntaxError:/gi, 'A temporary app issue occurred.')
    .replace(/\b(?:ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/gi, 'The connection was interrupted. Check your internet connection and try again.')
    .replace(/https?:\/\/[^\s)'"<>]+/gi, 'the service')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:vercel\.app|netlify\.app|herokuapp\.com|firebaseapp\.com|web\.app)\b/gi, 'the service')
    .replace(/\bpothub-self\.vercel\.app\b/gi, 'the service')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return message.slice(0, 500) || 'Something went wrong. Try again.';
}
