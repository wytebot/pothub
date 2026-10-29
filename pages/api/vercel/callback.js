import crypto from 'node:crypto';
import { appendCookie, clearCookie, frontendUrl, readCookie, requestOrigin, verifyOAuthState } from '../../../server/oauth-state.js';
export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function vercelCallback(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed.', requestId }); }
    const secret = String(process.env.SESSION_SECRET || '');
    const stateData = verifyOAuthState(readCookie(req, 'pothub_vercel_state'), secret, 600000);
    appendCookie(res, clearCookie('pothub_vercel_state'));
    if (!stateData || stateData.state !== String(req.query.state || '')) throw new Error('Vercel authorization state is missing, expired, or did not match. Start Connect Vercel again.');
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error).slice(0, 180));
    if (!req.query.code) throw new Error('Vercel did not return an authorization code. Retry Connect Vercel.');
    const { getSession, setBrowserSession, setSession } = await import('../../../server/lib.js');
    const session = await getSession(req);
    if (!session?.user?.id || !session.githubToken || session.authProvider === 'google') throw new Error('Your Developer session expired during Vercel authorization. Sign in with GitHub and connect Vercel again.');
    const clientId = String(process.env.VERCEL_CLIENT_ID || process.env.VERCEL_OAUTH_CLIENT_ID || process.env.VERCEL_APP_CLIENT_ID || process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.VERCEL_CLIENT_SECRET || process.env.VERCEL_OAUTH_CLIENT_SECRET || process.env.VERCEL_APP_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) throw new Error('Vercel OAuth Client ID or Client Secret is missing from Vercel environment variables.');
    const redirectUri = `${requestOrigin(req)}/api/vercel/callback`;
    const response = await fetch('https://api.vercel.com/login/oauth/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code: String(req.query.code), code_verifier: stateData.verifier, redirect_uri: redirectUri }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error(`Vercel token exchange failed (HTTP ${response.status}). Verify the OAuth callback is exactly ${redirectUri} and the Vercel app credentials are correct.`);
    const who = await fetch('https://api.vercel.com/login/oauth/userinfo', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/json' } });
    const identity = await who.json().catch(() => ({}));
    if (!who.ok || !identity.sub) throw new Error('Vercel could not verify the authorized account. Check OAuth scopes and retry.');
    const updated = { ...session, vercelAccessToken: data.access_token, vercelRefreshToken: data.refresh_token || null, vercelTokenExpiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 30000, vercelUserId: String(identity.sub), vercelUsername: String(identity.preferred_username || identity.name || ''), vercelTeamId: data.team_id || session.vercelTeamId || null };
    // Preserve browser-session semantics: replace the opaque browser session rather than writing a stale parallel cookie.
    if (String(req.headers.cookie || '').includes('pothub_sid=')) await setBrowserSession(res, updated);
    else await setSession(res, updated);
    return res.redirect(302, frontendUrl(req, { connected: 'vercel' }));
  } catch (error) {
    console.error('[Pothub Vercel OAuth callback]', JSON.stringify({ requestId, message: String(error?.message || error).slice(0, 240) }));
    return res.redirect(302, frontendUrl(req, { auth_error: String(error?.message || 'Vercel connection failed.').slice(0, 180), auth_code: 'VERCEL_OAUTH_CALLBACK_FAILED', request_id: requestId }));
  }
}
