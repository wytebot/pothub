/**
 * Next.js/Vercel API bridge. Import the Express application lazily so module
 * initialization failures can be returned as JSON instead of Vercel HTML 500s.
 */
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
    responseLimit: false,
  },
  maxDuration: 60,
};

let appPromise;
async function loadApp() {
  if (!appPromise) {
    appPromise = import('../../server/app.js').then((module) => {
      if (typeof module.default !== 'function') {
        throw new Error('Express application did not export a request handler.');
      }
      return module.default;
    }).catch((error) => {
      // Allow a later warm invocation to retry if initialization failed.
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

export default async function pothubApi(req, res) {
  try {
    const app = await loadApp();
    // Express 4 routes have their own async error middleware; this try/catch
    // also catches synchronous handler/invocation errors.
    return await Promise.resolve(app(req, res));
  } catch (err) {
    console.error('[Pothub API bootstrap]', err);
    if (res.headersSent) return res.end();
    res.status(500).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      error: err?.message || 'API initialization failed',
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    }));
  }
}
