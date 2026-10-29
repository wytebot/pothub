import crypto from 'node:crypto';
import { appendCookie, frontendUrl, requestOrigin, signOAuthState, stateCookie } from '../../../server/oauth-state.js';
export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function vercelConnect(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed.' }); }
  try {
    const { getSession } = await import('../../../server/lib.js');
    const session = await getSession(req);
    if (!session?.user?.id || !session.githubToken || session.authProvider === 'google') return res.redirect(302, frontendUrl(req, { auth_error: 'Sign in with GitHub as Developer before connecting Vercel.' }));
    const clientId = String(process.env.VERCEL_CLIENT_ID || process.env.VERCEL_OAUTH_CLIENT_ID || process.env.VERCEL_APP_CLIENT_ID || process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID || '').trim();
    if (!clientId) throw new Error('Vercel OAuth Client ID is missing. Add VERCEL_CLIENT_ID (or the existing supported alias) in Vercel environment variables.');
    const secret = String(process.env.SESSION_SECRET || '');
    if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const signed = signOAuthState({ state, verifier, nonce, createdAt: Date.now() }, secret);
    appendCookie(res, stateCookie('pothub_vercel_state', signed));
    const url = new URL('https://vercel.com/oauth/authorize');
    for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: `${requestOrigin(req)}/api/vercel/callback`, response_type: 'code', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', scope: 'openid email profile offline_access' })) url.searchParams.set(key, value);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, url.toString());
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error('[Pothub Vercel OAuth start]', JSON.stringify({ requestId, message: String(error?.message || error).slice(0, 200) }));
    return res.redirect(302, frontendUrl(req, { auth_error: String(error?.message || 'Could not start Vercel authorization.').slice(0, 180), auth_code: 'VERCEL_OAUTH_START_FAILED', request_id: requestId }));
  }
}
