export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function authMe(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const { getSession, getCredits } = await import('../../../server/lib.js');
    const session = await getSession(req);
    if (!session?.user?.id) { const bearer = String(req.headers.authorization || ''); if (bearer.startsWith('Bearer ') && bearer.slice(7).split('.').length === 3) return res.status(401).json({ error: 'Firebase token could not be verified. Check Firebase Admin configuration.' }); return res.status(200).json({ user: null, credits: 0, demo: false }); }
    const balance = await getCredits(session.user.id);
    return res.status(200).json({ user: session.user, authProvider: session.authProvider || 'github', credits: balance.credits, demo: false });
  } catch (error) {
    console.error('[Pothub auth/me]', String(error?.message || error).slice(0, 180));
    return res.status(503).json({ error: 'Authentication account storage is temporarily unavailable.' });
  }
}
