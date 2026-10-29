import app from '../../server/app.js';

/**
 * Route every /api/* request through the existing Express backend under the
 * Next.js/Vercel runtime. This keeps OAuth callbacks, health checks and all
 * existing operations on the same origin as the browser UI.
 */
export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 60,
};

export default function pothubApi(req, res) {
  return app(req, res);
}
