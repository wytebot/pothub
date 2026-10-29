export const config = { api: { bodyParser: false, externalResolver: true } };
const GH = 'https://api.github.com';
function origin(req) { const configured = String(process.env.APP_URL || '').trim(); if (configured) { try { const u = new URL(configured); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) return u.origin; } catch {} } const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim(); if (!/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw new Error('Cannot determine the Pothub API host.'); return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`; }
function front(req, params = {}) { let u; try { u = new URL(String(process.env.FRONTEND_URL || origin(req))); } catch { u = new URL(origin(req)); } if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) u = new URL(origin(req)); u.pathname = '/'; u.search = ''; u.hash = ''; for (const [k,v] of Object.entries(params)) if (v != null) u.searchParams.set(k,String(v)); return u.toString(); }
function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.setHeader('Cache-Control', 'no-store'); res.end(); }
function appendCookie(res, cookie) { const current = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : current ? [current] : []), cookie]); }
function ensureAppend(res) { if (typeof res.append !== 'function') res.append = (name, value) => { const current = res.getHeader(name); res.setHeader(name, [...(Array.isArray(current) ? current : current ? [current] : []), value]); }; }
function clearStateCookie(res) { appendCookie(res, `pothub_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); }
export default async function githubCallback(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const secret = String(process.env.SESSION_SECRET || '');
  try {
    if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
    const { unsealData, sealData } = await import('@hapi/iron');
    const { databaseReady, db, getCredits, setBrowserSession, setSession } = await import('../../../../server/lib.js');
    const rawCookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('pothub_oauth_state='));
    const sealed = rawCookie?.slice('pothub_oauth_state='.length);
    const stateData = sealed ? await unsealData(decodeURIComponent(sealed), { password: secret, ttl: 600000 }) : null;
    if (!stateData || stateData.state !== String(req.query?.state || '')) throw new Error('GitHub sign-in state expired or did not match. Go back and tap Connect GitHub again.');
    if (req.query?.error) throw new Error(String(req.query.error_description || req.query.error));
    const clientId = String(process.env.GITHUB_CLIENT_ID || process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GH_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) throw new Error('GitHub OAuth credentials are not configured in Vercel.');
    const callbackUrl = `${origin(req)}/api/auth/github/callback`;
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: String(req.query?.code || ''), redirect_uri: callbackUrl, code_verifier: stateData.verifier }) });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'GitHub did not issue an access token. Check the registered callback URL.');
    const profileResponse = await fetch(`${GH}/user`, { signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    const ghUser = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !ghUser.id || !ghUser.login) throw new Error('Could not read your GitHub profile.');
    const emailResponse = await fetch(`${GH}/user/emails`, { signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    const emails = emailResponse.ok ? await emailResponse.json().catch(() => []) : [];
    const email = ghUser.email || (Array.isArray(emails) ? emails.find(e => e.primary && e.verified)?.email : null) || null;
    const user = { id: String(ghUser.id), login: ghUser.login, name: ghUser.name || ghUser.login, avatar_url: ghUser.avatar_url || null, email };
    clearStateCookie(res);
    if (!databaseReady) throw new Error('Pothub account storage is unavailable. Check Firebase Admin/Firestore configuration.');
    const initialized = await db.rpc('initialize_profile', { p_github_id: user.id, p_github_login: user.login, p_display_name: user.name, p_email: email, p_avatar_url: user.avatar_url, p_device_hash: null });
    if (initialized.error || !initialized.data?.ok) throw new Error(initialized.error?.message || 'Could not initialize the Pothub account.');
    const session = { user, githubToken: tokenData.access_token, authProvider: 'github', createdAt: Date.now() };
    ensureAppend(res);
    if (stateData.native) {
      await setSession(res, session);
      const ticket = await sealData({ purpose: 'native-handoff', ...session }, { password: secret, ttl: 120000 });
      return redirect(res, `ai.pothub.app://auth?ticket=${encodeURIComponent(ticket)}`);
    }
    await setBrowserSession(res, session);
    await getCredits(user.id);
    return redirect(res, front(req, { connected: 'github' }));
  } catch (error) {
    console.error('[Pothub direct GitHub OAuth callback]', String(error?.message || error).slice(0, 220));
    clearStateCookie(res);
    return redirect(res, front(req, { auth_error: error?.message || 'GitHub sign-in failed. Please try again.' }));
  }
}
