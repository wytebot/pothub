import app from '../server/app.js';

// Single Vercel function: vercel.json rewrites every /api/* request here.
export const config = { maxDuration: 60 };
export default app;
