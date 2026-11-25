// Same-origin Vercel serverless API for the Pothub application.
// The legacy standalone server handler is reused without opening a separate host.
import handler from '../server/src/index.ts';

export const config = { runtime: 'nodejs', maxDuration: 60, api: { bodyParser: false } };
export default handler;
