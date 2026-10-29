import app from '../server/app.js';

// Single Vercel function. vercel.json rewrites every /api/* request here and
// Express sees the original URL, so all routes in server/app.js resolve.
export default app;
