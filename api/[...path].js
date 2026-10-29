import app from '../server/app.js';

// Vercel filesystem catch-all for every nested /api/* endpoint.
// Do not rewrite /api/:path* to /api: that strips the requested route and
// makes Express see `/` instead of `/api/auth/github`, `/api/health`, etc.
export const config = { maxDuration: 60 };
export default app;
