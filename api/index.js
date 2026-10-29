import app from '../server/app.js';

// Handles the /api root; nested endpoints are served by [...path].js.
export const config = { maxDuration: 60 };
export default app;
