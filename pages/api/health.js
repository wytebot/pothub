export const config = { api: { bodyParser: false, externalResolver: true } };
function hostOrigin(req) { const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim(); return /^[A-Za-z0-9.:[\]-]+$/.test(host) ? `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}` : null; }
export default async function health(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let firebase = { configured: false, ready: false, error: null };
  let databaseReady = false, databaseError = () => null;
  try { const lib = await import('../../server/lib.js'); firebase = lib.firebaseAdminStatus(); databaseReady = lib.databaseReady; databaseError = lib.databaseError; } catch (error) { firebase = { configured: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON, ready: false, error: String(error?.message || error).slice(0, 160) }; }
  const secret = String(process.env.SESSION_SECRET || '');
  const appUrl = String(process.env.APP_URL || '').trim();
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim();
  const clientId = String(process.env.GITHUB_CLIENT_ID || process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GH_CLIENT_SECRET || '').trim();
  const fallback = hostOrigin(req);
  const checks = {
    APP_URL: appUrl ? 'configured' : fallback ? 'request-host fallback' : 'missing',
    FRONTEND_URL: frontendUrl ? 'configured' : fallback ? 'request-host fallback' : 'missing',
    GITHUB_CLIENT_ID: clientId ? 'configured' : 'missing',
    GITHUB_CLIENT_SECRET: clientSecret ? 'configured' : 'missing',
    FIREBASE_SERVICE_ACCOUNT_JSON: firebase.ready ? 'configured and initialized' : firebase.configured ? 'provided but not initialized' : 'missing (ADC may still be available)',
    SESSION_SECRET: secret.length >= 32 ? 'configured' : secret ? 'invalid: needs at least 32 characters' : 'missing',
  };
  const ok = !!clientId && !!clientSecret && secret.length >= 32 && databaseReady;
  return res.status(ok ? 200 : 503).json({ ok, app: 'Pothub', status: ok ? 'ready' : 'degraded', checks, firebaseAdmin: firebase.ready ? 'ready' : 'unavailable', firebaseError: firebase.error || databaseError()?.message || undefined, githubCallbackUrl: `${appUrl || fallback || 'https://pothub-self.vercel.app'}/api/auth/github/callback` });
}
